#!/usr/bin/env bash
# Verify gate: tsc -> eslint -> vitest -> next build, so sánh với baseline.
# Usage:
#   verify.sh --baseline   # ghi baseline vào .cleanup/baseline.txt
#   verify.sh              # full check, fail nếu tệ hơn baseline
#   verify.sh --fast       # bỏ build
set -uo pipefail

MODE="check"; SKIP_BUILD=0
for a in "$@"; do
  case "$a" in
    --baseline) MODE="baseline" ;;
    --fast) SKIP_BUILD=1 ;;
  esac
done

OUT=".cleanup"; mkdir -p "$OUT"
LOGDIR="$OUT/logs"; mkdir -p "$LOGDIR"

# --- package manager ---
if   [ -f pnpm-lock.yaml ]; then PM="pnpm"; X="pnpm exec"
elif [ -f yarn.lock ];      then PM="yarn"; X="yarn"
elif ls bun.lock* >/dev/null 2>&1; then PM="bun"; X="bunx"
else PM="npm"; X="npx --no-install"; fi

has_script() { node -e "process.exit(require('./package.json').scripts?.['$1']?0:1)" 2>/dev/null; }

count() { # đếm dòng lỗi/cảnh báo trong log
  case "$1" in
    tsc)    c=$(grep -cE "error TS[0-9]+" "$LOGDIR/tsc.log" 2>/dev/null); echo "${c:-0}" ;;
    eslint) grep -oE "[0-9]+ errors?" "$LOGDIR/eslint.log" 2>/dev/null | tail -1 | grep -oE "[0-9]+" || echo 0 ;;
    eslintw) grep -oE "[0-9]+ warnings?" "$LOGDIR/eslint.log" 2>/dev/null | tail -1 | grep -oE "[0-9]+" || echo 0 ;;
    vitest) grep -E "^[[:space:]]*Tests[[:space:]]" "$LOGDIR/vitest.log" 2>/dev/null | grep -oE "[0-9]+ failed" | grep -oE "[0-9]+" || echo 0 ;;
  esac
}

run() { # name, cmd...
  local name="$1"; shift
  echo "▶ $name: $*"
  "$@" >"$LOGDIR/$name.log" 2>&1
  local rc=$?
  echo "  exit=$rc (log: $LOGDIR/$name.log)"
  echo "$rc" > "$LOGDIR/$name.rc"
}

run tsc $X tsc --noEmit -p .
# worker có tsconfig riêng?
for tc in tsconfig.worker.json tsconfig.scripts.json; do
  [ -f "$tc" ] && run "tsc_$(basename $tc .json)" $X tsc --noEmit -p "$tc"
done

run eslint $X eslint . --max-warnings=-1

if has_script test; then
  run vitest $X vitest run
else
  run vitest $X vitest run --passWithNoTests
fi

BUILD_RC="skipped"
if [ "$SKIP_BUILD" -eq 0 ]; then
  if has_script build; then run build $PM run build; else run build $X next build; fi
  BUILD_RC=$(cat "$LOGDIR/build.rc")
fi

TSC=$(count tsc); ESL=$(count eslint); ESW=$(count eslintw); VIT=$(count vitest)
SUMMARY="tsc_errors=$TSC
eslint_errors=$ESL
eslint_warnings=$ESW
vitest_failed=$VIT
vitest_rc=$(cat "$LOGDIR/vitest.rc")
build_rc=$BUILD_RC"

echo "---- summary ----"; echo "$SUMMARY"

if [ "$MODE" = "baseline" ]; then
  echo "$SUMMARY" > "$OUT/baseline.txt"
  echo "✔ baseline saved to $OUT/baseline.txt"
  exit 0
fi

[ -f "$OUT/baseline.txt" ] || { echo "✖ Chưa có baseline. Chạy: verify.sh --baseline"; exit 2; }
get() { grep "^$1=" "$OUT/baseline.txt" | cut -d= -f2; }

FAIL=0
cmp_le() { # name current baseline
  if [ "$2" -gt "$3" ]; then echo "✖ $1: $2 > baseline $3"; FAIL=1; else echo "✔ $1: $2 (baseline $3)"; fi
}
cmp_le tsc_errors "$TSC" "$(get tsc_errors)"
cmp_le eslint_errors "$ESL" "$(get eslint_errors)"
cmp_le eslint_warnings "$ESW" "$(get eslint_warnings)"
cmp_le vitest_failed "$VIT" "$(get vitest_failed)"

V0=$(get vitest_rc); V1=$(cat "$LOGDIR/vitest.rc")
if [ "$V0" = "0" ] && [ "$V1" != "0" ]; then echo "✖ vitest: exit $V1 (baseline pass)"; FAIL=1; fi

B0=$(get build_rc)
if [ "$BUILD_RC" != "skipped" ] && [ "$B0" = "0" ] && [ "$BUILD_RC" != "0" ]; then
  echo "✖ build: fail (baseline pass)"; FAIL=1
fi

[ "$FAIL" -eq 0 ] && echo "✅ VERIFY PASS" || echo "❌ VERIFY FAIL — xem $LOGDIR/"
exit $FAIL
