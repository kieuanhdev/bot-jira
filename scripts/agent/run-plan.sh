#!/usr/bin/env bash
# Runs docs/superpowers/plans/2026-10-19-library-adoption.md one task per fresh agy session.
# After each task: verify commit + forbidden paths + typecheck/lint/test, then a read-only
# Claude review. Progress lives in .agent_run/done.txt (git-excluded), so re-running resumes.
#
# Usage: scripts/agent/run-plan.sh [--dry-run] [--until <task>] [--only <task>] [--no-review] [--yes]
#   --dry-run    print the next task and its prompt, run nothing
#   --until 2.8  stop after this task
#   --only 1.3   run just this task (even if marked done)
#   --no-review  skip the Claude review step
#   --yes        do not pause for manual QA on UI tasks
#   --watch      open agy's interactive CLI so you can watch it work; exit it (Ctrl+C twice) when it says done
# Env: AGY_MODEL (agy --model), REVIEW_MODEL (claude --model; default = your Claude Code default),
#      AGY_TIMEOUT (default 90m), FIX_ROUNDS (default 1)

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

PLAN="docs/superpowers/plans/2026-10-19-library-adoption.md"
RUN_DIR=".agent_run"
LOG_DIR="$RUN_DIR/logs"
DONE_FILE="$RUN_DIR/done.txt"
HANDOFF="$RUN_DIR/HANDOFF.md"
BLOCKED="$RUN_DIR/BLOCKED.md"
CURRENT_FILE="$RUN_DIR/current"   # "<task id> <base sha>" while a task is in progress
BRANCH="refactor/library-adoption"
AGY_TIMEOUT="${AGY_TIMEOUT:-90m}"
FIX_ROUNDS="${FIX_ROUNDS:-1}"

# id|flags  (flags: build = also run npm run build, qa = pause for manual QA, optional = may be skipped)
TASKS=(
  "0.1|" "0.2|"
  "1.1|" "1.2|build" "1.3|" "1.4|" "1.5|"
  "2.1|" "2.2|" "2.3|" "2.4|" "2.5|" "2.6|" "2.7|" "2.8|"
  "3.1|" "3.2|" "3.3|" "3.4|" "3.5|" "3.6|" "3.7|" "3.8|optional"
  "4.1|" "4.2|" "4.3|" "4.4|" "4.5|" "4.6|" "4.7|optional"
  "5.1|build,qa" "5.2|build,qa" "5.3|build,qa" "5.4|build,qa" "5.5|build,qa" "5.6|build,qa"
  "5.7|build,qa" "5.8|build,qa" "5.9|build,qa" "5.10|build,qa" "5.11|build,qa"
)

FORBIDDEN_RE='^(\.env|Dockerfile|compose\.yaml|AGENTS\.md|CLAUDE\.md|autoimprove/|\.kilo/|prisma/migrations/)'
DEPS_RE='^(package\.json|package-lock\.json)$'

DRY_RUN=0; UNTIL=""; ONLY=""; REVIEW=1; ASSUME_YES=0; WATCH=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --until) UNTIL="$2"; shift ;;
    --only) ONLY="$2"; shift ;;
    --no-review) REVIEW=0 ;;
    --yes) ASSUME_YES=1 ;;
    --watch) WATCH=1 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

say()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mSTOP: %s\033[0m\n' "$*" >&2; exit 1; }

has_flag() { [[ ",$2," == *",$1,"* ]]; }
is_done()  { [[ -f "$DONE_FILE" ]] && grep -q "^$1 " "$DONE_FILE"; }
major()    { echo "${1%%.*}"; }

preflight() {
  command -v agy >/dev/null || fail "agy not found in PATH"
  [[ $REVIEW -eq 0 ]] || command -v claude >/dev/null || fail "claude not found (or use --no-review)"
  [[ -f "$PLAN" ]] || fail "plan not found: $PLAN"
  mkdir -p "$LOG_DIR"
  touch "$DONE_FILE" "$HANDOFF"
  grep -qxF "/$RUN_DIR/" .git/info/exclude 2>/dev/null || echo "/$RUN_DIR/" >> .git/info/exclude
  [[ $DRY_RUN -eq 0 ]] || return 0
  # An interrupted task (e.g. quota ran out) may leave partial changes; those are resumed, not rejected.
  if [[ ! -s "$CURRENT_FILE" ]]; then
    [[ -z "$(git status --porcelain)" ]] || fail "working tree is not clean; commit or stash first"
  fi
  local current; current="$(git branch --show-current)"
  if [[ "$current" != "$BRANCH" ]]; then
    if git show-ref --verify --quiet "refs/heads/$BRANCH"; then git switch "$BRANCH"
    else git switch -c "$BRANCH"; fi
  fi
  [[ -d node_modules ]] || fail "node_modules missing; run npm ci first"
}

task_prompt() {
  local id="$1" flags="$2"
  cat <<EOF
You are the implementation worker for ONE task of an approved plan in the repository at $ROOT.

TASK: Task $id of $PLAN
- Read the plan sections "Quyết định đã chốt", "2. Quy ước cho module ngày giờ", "3. Global Constraints"
  (including "Giới hạn an toàn cho worker agy") and "4. Review Focus", then the section for Task $id.
$( [[ "$id" =~ ^3\.[2-5]$ ]] && echo "  Tasks 3.2–3.5 share one section: do only the table row for $id plus the shared rules above the table." )
- Read $HANDOFF for notes from earlier tasks.
- Do exactly Task $id. Do not start any other task. Follow its steps in order (test first where the plan says so).
- Run the verification commands the task names, then: npm run typecheck && npm run lint && npm test.
- Tick this task's checkboxes in the plan file, then make the commit(s) the task specifies.
  Every commit message for this task ends with the line: Plan-Task: $id
- Manual QA steps ("QA tay") cannot be done by you: skip them and list them under "Manual QA" in $HANDOFF.
- Append a section "## Task $id" to $HANDOFF: files changed, key names/signatures, deliberate behaviour changes, notes for later tasks. Do not commit $RUN_DIR.

STOP RULES (the plan's "dừng lại và báo"):
- If a stop condition hits, or an existing test fails in a way the plan does not list, or anything outside the plan is needed:
  do NOT commit. Write the reason, the failing command and its output to $BLOCKED and end your turn.
$(has_flag optional "$flags" && echo "- This task is OPTIONAL. If its stop condition hits: revert your code changes, record the reason in the plan's Phụ lục B, and commit only that doc change with subject 'docs(plan): skip task $id' (plus the Plan-Task line).")

HARD LIMITS: no git push, no PR, no merge, no reset --hard, no checkout -- ., no branch deletion, no prisma migrate/db:deploy/db:seed,
no edits to .env*, Dockerfile, compose.yaml, AGENTS.md, CLAUDE.md, autoimprove/, .kilo/, prisma/migrations/.
$( [[ "$id" == "0.1" ]] && echo "This task may edit package.json and package-lock.json." || echo "Do not edit package.json or package-lock.json and do not install packages." )
EOF
}

fix_prompt() {
  local id="$1" review_file="$2"
  cat <<EOF
You are the implementation worker for Task $id of $PLAN in $ROOT. A reviewer rejected your commits.
Read the review below, fix every listed issue, run npm run typecheck && npm run lint && npm test,
and commit the fix with a message ending in 'Plan-Task: $id'. Same hard limits and stop rules as before
(see the plan's Global Constraints; if you cannot fix it, write the reason to $BLOCKED and do not commit).

--- REVIEW ---
$(cat "$review_file")
EOF
}

resume_prompt() {
  local id="$1" flags="$2" base="$3"
  cat <<EOF
RESUMING AN INTERRUPTED SESSION. The previous worker on this task stopped mid-way (for example it ran out of quota).
Its partial work is in the repository: inspect 'git status', 'git diff', and 'git log --oneline $base..HEAD'.
Keep what is correct, finish what is missing, and do not redo steps already done.
$( [[ -s "$LOG_DIR/review-$id.txt" ]] && echo "A reviewer already rejected an earlier attempt; also fix every issue in $LOG_DIR/review-$id.txt." )

$(task_prompt "$id" "$flags")
EOF
}

review_prompt() {
  local id="$1" base="$2"
  cat <<EOF
You are a read-only code reviewer. Do not edit any file.
Review the commits for Task $id of the plan $PLAN in $ROOT: run 'git log --oneline $base..HEAD' and 'git diff $base..HEAD'.
Read the plan's Global Constraints, Review Focus, section 2 (date conventions) and the section for Task $id.
Check:
1. The diff does what Task $id specifies (files, exported names and signatures, values) and nothing from other tasks.
2. No existing test assertion was changed unless the task lists that exact change; no test was skipped or deleted (except files the task deletes).
3. Behaviour is preserved where the task says so; deliberate behaviour changes are the ones the task lists.
4. Correctness bugs in the new code (timezone handling, error shapes, Escape/focus handling for UI).
5. Forbidden files untouched.
Report findings briefly, most severe first. Ignore style nits.
The LAST line of your answer must be exactly 'VERDICT: PASS' or 'VERDICT: FAIL'.
FAIL only for real defects or plan violations.
EOF
}

run_agy() {
  local prompt="$1" log="$2"
  if [[ $WATCH -eq 1 ]]; then
    # Interactive CLI: the agent's work is visible live; the session ends when the user exits it.
    local iargs=(-i "$prompt

When the task is finished (committed) or blocked, end with the line: XONG - thoát bằng Ctrl+C hai lần để script chạy tiếp."
      --add-dir "$ROOT" --dangerously-skip-permissions)
    [[ -n "${AGY_MODEL:-}" ]] && iargs+=(--model "$AGY_MODEL")
    echo "[interactive session, output not captured]" >> "$log"
    agy "${iargs[@]}" || true
    return 0
  fi
  local args=(-p "$prompt" --add-dir "$ROOT" --dangerously-skip-permissions --print-timeout "$AGY_TIMEOUT")
  [[ -n "${AGY_MODEL:-}" ]] && args+=(--model "$AGY_MODEL")
  local code=0
  agy "${args[@]}" 2>&1 | tee -a "$log" || code="${PIPESTATUS[0]}"
  if [[ "$code" -ne 0 ]]; then
    fail "agy exited with code $code (quota/network?). Partial work is kept; re-run the same command later to resume (log: $log)"
  fi
}

verify() {
  local id="$1" flags="$2" base="$3" log="$4"
  [[ ! -s "$BLOCKED" ]] || { cat "$BLOCKED"; fail "Task $id blocked by the worker (see $BLOCKED)"; }
  [[ "$(git rev-parse HEAD)" != "$base" ]] || fail "Task $id produced no commit (log: $log)"
  [[ -z "$(git status --porcelain)" ]] || { git status --short; fail "Task $id left uncommitted changes"; }

  local changed; changed="$(git diff --name-only "$base" HEAD)"
  if grep -E "$FORBIDDEN_RE" <<<"$changed"; then fail "Task $id touched forbidden files"; fi
  if [[ "$id" != "0.1" ]] && grep -E "$DEPS_RE" <<<"$changed"; then fail "Task $id changed dependency manifests"; fi

  say "Verifying Task $id"
  { npm run typecheck && npm run lint && npm test; } >>"$log" 2>&1 || fail "checks failed after Task $id (log: $log)"
  if [[ "$(major "$id")" -ge 3 || "$id" == "2.8" ]]; then
    npm run test:tz >>"$log" 2>&1 || fail "test:tz failed after Task $id (log: $log)"
  fi
  if has_flag build "$flags"; then
    npm run build >>"$log" 2>&1 || fail "build failed after Task $id (log: $log)"
  fi
}

review() {
  local id="$1" base="$2" out="$3"
  say "Claude review for Task $id"
  local model_args=()
  [[ -n "${REVIEW_MODEL:-}" ]] && model_args=(--model "$REVIEW_MODEL")
  claude -p "$(review_prompt "$id" "$base")" "${model_args[@]}" \
    --allowedTools "Read" "Grep" "Glob" "Bash(git diff:*)" "Bash(git log:*)" "Bash(git show:*)" \
    --disallowedTools "Edit" "Write" "NotebookEdit" \
    > "$out" 2>&1 || true
  cat "$out"
  if ! grep -qE '^VERDICT: (PASS|FAIL)' "$out"; then
    fail "review for Task $id did not finish (Claude quota/network?). Commits are kept; re-run later to redo only the review"
  fi
  tail -n 5 "$out" | grep -q '^VERDICT: PASS'
}

run_task() {
  local id="$1" flags="$2"
  local log="$LOG_DIR/task-$id.log"
  local base; base="$(git rev-parse HEAD)"
  local resuming=0
  if [[ -s "$CURRENT_FILE" ]]; then
    local cur_id cur_base
    read -r cur_id cur_base < "$CURRENT_FILE"
    [[ "$cur_id" == "$id" ]] || fail "Task $cur_id is in progress ($CURRENT_FILE); finish it first or delete that file"
    base="$cur_base"; resuming=1
  fi

  if [[ $DRY_RUN -eq 1 ]]; then
    say "Next task: $id (flags: ${flags:-none}, resuming: $resuming)"; task_prompt "$id" "$flags"; exit 0
  fi

  echo "$id $base" > "$CURRENT_FILE"
  : > "$BLOCKED"

  if [[ $resuming -eq 1 && -z "$(git status --porcelain)" && "$(git rev-parse HEAD)" != "$base" ]]; then
    # Implementation was committed before the interruption: only re-check and review.
    say "Task $id — resuming at verification/review (commits since ${base:0:7} kept)"
  elif [[ $resuming -eq 1 ]]; then
    say "Task $id — resuming interrupted work in a fresh agy session (log: $log)"
    run_agy "$(resume_prompt "$id" "$flags" "$base")" "$log"
  else
    say "Task $id — fresh agy session (log: $log)"
    run_agy "$(task_prompt "$id" "$flags")" "$log"
  fi
  verify "$id" "$flags" "$base" "$log"

  if [[ $REVIEW -eq 1 ]]; then
    local round=0 review_file="$LOG_DIR/review-$id.txt"
    until review "$id" "$base" "$review_file"; do
      (( round < FIX_ROUNDS )) || fail "review FAIL for Task $id (see $review_file)"
      round=$((round + 1))
      say "Fix round $round for Task $id"
      local before_fix; before_fix="$(git rev-parse HEAD)"
      run_agy "$(fix_prompt "$id" "$review_file")" "$log"
      verify "$id" "$flags" "$before_fix" "$log"
    done
  fi

  if has_flag qa "$flags" && [[ $ASSUME_YES -eq 0 ]]; then
    say "Manual QA for Task $id: run 'npm run dev', follow the task's QA checklist and $HANDOFF (Manual QA)."
    read -r -p "QA passed? [y/N] " ans
    [[ "$ans" == "y" || "$ans" == "Y" ]] || fail "QA not confirmed for Task $id; commits kept, fix then re-run"
  fi

  echo "$id $(git rev-parse --short HEAD) $(date -Iseconds)" >> "$DONE_FILE"
  : > "$CURRENT_FILE"
  say "Task $id done"
}

main() {
  preflight
  for entry in "${TASKS[@]}"; do
    local id="${entry%%|*}" flags="${entry#*|}"
    if [[ -n "$ONLY" ]]; then
      [[ "$id" == "$ONLY" ]] || continue
    elif is_done "$id"; then
      continue
    fi
    run_task "$id" "$flags"
    [[ -n "$ONLY" || "$id" == "$UNTIL" ]] && break
  done
  say "Finished. Progress: $DONE_FILE"
}

main
