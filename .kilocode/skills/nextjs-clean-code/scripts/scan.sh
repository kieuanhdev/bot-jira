#!/usr/bin/env bash
# Scan repo -> .cleanup/scan-report.md
# Dùng knip + jscpd qua npx (không thêm vào package.json của dự án).
set -uo pipefail

OUT=".cleanup"; mkdir -p "$OUT/logs"
R="$OUT/scan-report.md"
SRC="src"
[ -d "$SRC" ] || SRC="."
EXCL='--exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=.cleanup --exclude-dir=generated --exclude-dir=coverage'
GLOB='--include=*.ts --include=*.tsx'

section() { printf "\n## %s\n\n" "$1" >> "$R"; }
grepc() { grep -rnE $EXCL $GLOB "$1" "$SRC" 2>/dev/null; }

echo "# Scan report — $(date '+%Y-%m-%d %H:%M')" > "$R"

# ---------- knip ----------
section "Unused files / exports / deps (knip)"
cat > "$OUT/knip.json" <<'JSON'
{
  "$schema": "https://unpkg.com/knip@5/schema.json",
  "entry": [
    "src/worker.ts",
    "src/app/**/{page,layout,template,loading,error,global-error,not-found,route,default}.{ts,tsx}",
    "src/{middleware,proxy,instrumentation}.ts",
    "prisma/seed.ts",
    "prisma.config.ts",
    "scripts/**/*.ts"
  ],
  "project": ["src/**/*.{ts,tsx}", "prisma/**/*.ts", "scripts/**/*.ts"],
  "ignore": ["src/components/ui/**", "**/generated/**"],
  "next": true,
  "vitest": true
}
JSON
if timeout 300 npx -y knip@5 --config "$OUT/knip.json" --no-exit-code --reporter compact > "$OUT/logs/knip.log" 2>&1; then
  echo '```' >> "$R"; grep -v "^npm notice" "$OUT/logs/knip.log" | head -300 >> "$R"; echo '```' >> "$R"
else
  echo "_knip lỗi — xem .cleanup/logs/knip.log (có thể config dự án đặc thù)._" >> "$R"
fi
echo "> ⚠️ Kiểm tra false positive theo mục 2 trong SKILL.md trước khi xoá." >> "$R"

# ---------- jscpd ----------
section "Duplicate code (jscpd, min 8 lines)"
if timeout 300 npx -y jscpd@4 "$SRC" --min-lines 8 --min-tokens 60 \
    --ignore "**/node_modules/**,**/.next/**,**/components/ui/**,**/generated/**,**/*.test.*" \
    --reporters console --silent > "$OUT/logs/jscpd.log" 2>&1 || true; then
  echo '```' >> "$R"; grep -E "Clone found|Found [0-9]+ clones|Duplicated" "$OUT/logs/jscpd.log" | head -150 >> "$R"; echo '```' >> "$R"
fi

# ---------- weak types ----------
section "Type yếu"
for pat in ':\s*any\b' '\bas any\b' 'as unknown as' '@ts-ignore' '@ts-expect-error' 'eslint-disable' '<any>'; do
  n=$(grepc "$pat" | wc -l | tr -d ' ')
  echo "- \`$pat\`: **$n**" >> "$R"
done
echo "" >> "$R"; echo "Top file nhiều \`any\`:" >> "$R"; echo '```' >> "$R"
grepc '(:\s*any\b|\bas any\b|<any>)' | cut -d: -f1 | sort | uniq -c | sort -rn | head -20 >> "$R"
echo '```' >> "$R"

# ---------- big files ----------
section "File lớn (> 300 dòng)"
echo '```' >> "$R"
find "$SRC" \( -name node_modules -o -name .next -o -name generated -o -path '*/components/ui' \) -prune -o \
  \( -name '*.ts' -o -name '*.tsx' \) -type f -print0 2>/dev/null \
  | xargs -0 wc -l 2>/dev/null | grep -v ' total$' | awk '$1>300' | sort -rn | head -40 >> "$R"
echo '```' >> "$R"

# ---------- route handlers ----------
section "Route handlers (dòng / số handler)"
echo '```' >> "$R"
find "$SRC" -path '*/app/api/*' -name 'route.ts' -type f 2>/dev/null | while read -r f; do
  l=$(wc -l < "$f"); h=$(grep -cE 'export (async )?function (GET|POST|PUT|PATCH|DELETE)' "$f")
  echo "$l lines, $h handlers  $f"
done | sort -rn | head -40 >> "$R"
echo '```' >> "$R"

# ---------- use client ----------
section "\"use client\" có thể thừa (không thấy hook/event/browser API)"
echo '```' >> "$R"
grep -rlE $EXCL $GLOB "^['\"]use client['\"]" "$SRC" 2>/dev/null | while read -r f; do
  if ! grep -qE '\buse[A-Z][A-Za-z]*\(|\bon[A-Z][a-zA-Z]*=|window\.|document\.|localStorage|navigator\.|createContext|@dnd-kit|zustand' "$f"; then
    echo "$f"
  fi
done >> "$R"
echo '```' >> "$R"

# ---------- components with many hooks ----------
section "Component nhiều state/effect (useState+useEffect ≥ 6)"
echo '```' >> "$R"
grep -rlE $EXCL --include=*.tsx 'useState|useEffect' "$SRC" 2>/dev/null | while read -r f; do
  n=$(grep -cE '\buse(State|Effect)\(' "$f"); [ "$n" -ge 6 ] && echo "$n  $f"
done | sort -rn | head -30 >> "$R"
echo '```' >> "$R"

# ---------- prisma / query / zustand smells ----------
section "Stack smells"
{
  echo "- \`new PrismaClient(\`: $(grepc 'new PrismaClient\(' | wc -l | tr -d ' ') chỗ"
  grepc 'new PrismaClient\(' | sed 's/^/  - /'
  echo "- queryKey literal: $(grepc 'queryKey:\s*\[' | wc -l | tr -d ' ') chỗ"
  echo "- useQuery với onSuccess/onError (v5 đã bỏ): $(grep -rnE $EXCL $GLOB -A8 'useQuery\(' "$SRC" 2>/dev/null | grep -cE 'onSuccess|onError')"
  echo "- Zustand destructure cả store (\`= use\w+Store()\`): $(grepc '=\s*use[A-Z]\w*Store\(\s*\)' | wc -l | tr -d ' ')"
  grepc '=\s*use[A-Z]\w*Store\(\s*\)' | head -20 | sed 's/^/  - /'
  echo "- getServerSession không kèm authOptions: $(grepc 'getServerSession\(\s*\)' | wc -l | tr -d ' ')"
  echo "- \`(session.user as\` cast: $(grepc 'session\??\.user as' | wc -l | tr -d ' ')"
  echo "- bcrypt sync: $(grepc '(hashSync|compareSync)\(' | wc -l | tr -d ' ')"
  echo "- \`useEffect\` + fetch: $(grep -rnE $EXCL $GLOB -A6 'useEffect\(' "$SRC" 2>/dev/null | grep -cE '\bfetch\(')"
} >> "$R"

# ---------- misc ----------
section "Misc"
echo "- console.log: $(grepc 'console\.log\(' | wc -l | tr -d ' ')" >> "$R"
echo "- TODO/FIXME/HACK: $(grepc '(TODO|FIXME|HACK)' | wc -l | tr -d ' ')" >> "$R"

echo "✔ Report: $R"
