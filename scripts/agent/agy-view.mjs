#!/usr/bin/env node
// Renders `agy --output-format stream-json` events as a readable live transcript.
// Usage: agy -p "..." --output-format stream-json | node scripts/agent/agy-view.mjs
import { createInterface } from "node:readline";

const tty = process.stdout.isTTY;
const c = (code, s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const dim = (s) => c("2", s);
const cyan = (s) => c("36", s);
const red = (s) => c("31", s);
const green = (s) => c("32", s);

const MAX = 160;
const clip = (s) => {
  const one = String(s).replace(/\s+/g, " ").trim();
  return one.length > MAX ? `${one.slice(0, MAX)}…` : one;
};

// Prefer the parameter that best describes the call; fall back to the first string value.
const PREFERRED = ["CommandLine", "AbsolutePath", "Path", "TargetFile", "File", "Query", "SearchPath", "DirectoryPath", "Url"];
function summarize(params = {}) {
  for (const key of PREFERRED) if (typeof params[key] === "string") return params[key];
  const first = Object.values(params).find((v) => typeof v === "string");
  return first ?? "";
}

function onEvent(ev) {
  if (ev.event === "init") {
    console.log(dim(`agy session ${ev.conversation_id}`));
    return;
  }
  if (ev.event === "result") {
    const r = ev.result ?? {};
    const ok = r.status === "SUCCESS";
    const tokens = r.usage?.total_tokens;
    console.log((ok ? green : red)(`\n■ ${r.status} · ${Math.round(r.duration_seconds ?? 0)}s${tokens ? ` · ${tokens} tokens` : ""}`));
    return;
  }
  const s = ev.step_update;
  if (!s) return;

  if (s.step_type === "tool") {
    const info = s.tool_info ?? {};
    if (s.state === "ACTIVE") {
      console.log(`${cyan("●")} ${s.tool_name} ${dim(clip(summarize(info.parameters)))}`);
    } else if (s.state === "DONE" && typeof info.output === "string") {
      const m = info.output.match(/Command exited with code (\d+)/);
      if (m && m[1] !== "0") console.log(red(`  ✗ exit ${m[1]}`));
    } else if (s.state && s.state !== "DONE") {
      console.log(red(`  ✗ ${s.tool_name}: ${s.state}`));
    }
    return;
  }
  if (s.step_type === "agent_response" && s.text_delta) {
    process.stdout.write(`\n${s.text_delta.replace(/\n?$/, "\n")}`);
  }
}

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  if (!line.trim()) return;
  try {
    onEvent(JSON.parse(line));
  } catch {
    console.log(line); // non-JSON output (errors, warnings) is shown as-is
  }
});
