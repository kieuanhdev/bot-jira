import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const autoImproveDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(autoImproveDir);
const configPath = join(autoImproveDir, "config.json");
const logsDir = join(autoImproveDir, "logs");
const mode = process.argv[2];

if (!new Set(["baseline", "validate"]).has(mode)) {
  console.error("Usage: ./autoimprove/validate.sh <baseline|validate> [--attempt=N]");
  process.exit(2);
}

function failConfig(message) {
  console.error(`AutoImprove configuration error: ${message}`);
  process.exit(2);
}

let config;
try {
  config = JSON.parse(readFileSync(configPath, "utf8"));
} catch (error) {
  failConfig(error instanceof Error ? error.message : String(error));
}

if (!Number.isInteger(config.retryLimit) || config.retryLimit < 0) {
  failConfig("retryLimit must be a non-negative integer");
}
if (!Number.isInteger(config.timeoutMs) || config.timeoutMs <= 0) {
  failConfig("timeoutMs must be a positive integer");
}
if (!Array.isArray(config.checks) || config.checks.length === 0) {
  failConfig("checks must be a non-empty array");
}

const attemptArg = process.argv.slice(3).find((arg) => arg.startsWith("--attempt="));
const attempt = attemptArg ? Number(attemptArg.slice("--attempt=".length)) : 0;
if (!Number.isInteger(attempt) || attempt < 0) {
  failConfig("--attempt must be a non-negative integer");
}
if (mode === "validate" && attempt > config.retryLimit) {
  failConfig(`attempt ${attempt} exceeds retryLimit ${config.retryLimit}`);
}

const ids = new Set();
for (const check of config.checks) {
  if (!check || typeof check.id !== "string" || !/^[a-z0-9-]+$/.test(check.id)) {
    failConfig("every check needs a lowercase id containing only letters, numbers, and hyphens");
  }
  if (ids.has(check.id)) failConfig(`duplicate check id: ${check.id}`);
  ids.add(check.id);
  if (!Array.isArray(check.command) || check.command.length === 0 || check.command.some((part) => typeof part !== "string" || part.length === 0)) {
    failConfig(`check ${check.id} must define command as a non-empty string array`);
  }
  if (typeof check.mandatory !== "boolean" || typeof check.enabled !== "boolean") {
    failConfig(`check ${check.id} must define boolean mandatory and enabled values`);
  }
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const runName = `${timestamp}-${mode}-attempt-${attempt}`;
const runDir = join(logsDir, runName);
mkdirSync(runDir, { recursive: true });

const packageJson = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));
const git = (args) => {
  const result = spawnSync("git", args, { cwd: projectRoot, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
};

function commandLabel(command) {
  return command.map((part) => (/^[A-Za-z0-9_./:@=-]+$/.test(part) ? part : JSON.stringify(part))).join(" ");
}

function unavailableResult(check, reason) {
  return {
    id: check.id,
    mandatory: check.mandatory,
    command: check.command,
    status: "UNAVAILABLE",
    exitCode: null,
    durationMs: 0,
    log: null,
    reason,
  };
}

const startedAt = new Date().toISOString();
const results = [];

for (const check of config.checks) {
  if (!check.enabled) {
    results.push({
      id: check.id,
      mandatory: check.mandatory,
      command: check.command,
      status: "SKIPPED",
      exitCode: null,
      durationMs: 0,
      log: null,
      reason: check.skipReason || "Disabled in autoimprove/config.json",
    });
    continue;
  }

  if (check.command[0] === "npm" && check.command[1] === "run") {
    const scriptName = check.command[2];
    if (!scriptName || !packageJson.scripts?.[scriptName]) {
      results.push(unavailableResult(check, `npm script not found: ${scriptName || "(missing)"}`));
      continue;
    }
  }

  const checkStarted = Date.now();
  const execution = spawnSync(check.command[0], check.command.slice(1), {
    cwd: projectRoot,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 50 * 1024 * 1024,
    timeout: config.timeoutMs,
  });
  const durationMs = Date.now() - checkStarted;
  const logPath = join(runDir, `${check.id}.log`);
  const output = [
    `$ ${commandLabel(check.command)}`,
    "",
    execution.stdout || "",
    execution.stderr || "",
  ].join("\n");
  writeFileSync(logPath, output, { mode: 0o600 });

  let status = execution.status === 0 ? "PASS" : "FAIL";
  let reason = execution.signal ? `Terminated by signal ${execution.signal}` : null;
  if (execution.error?.code === "ENOENT") {
    status = "UNAVAILABLE";
    reason = `Executable not found: ${check.command[0]}`;
  } else if (execution.error?.code === "ETIMEDOUT") {
    status = "FAIL";
    reason = `Timed out after ${config.timeoutMs}ms`;
  } else if (execution.error && !reason) {
    reason = execution.error.message;
  }

  results.push({
    id: check.id,
    mandatory: check.mandatory,
    command: check.command,
    status,
    exitCode: execution.status,
    durationMs,
    log: relative(projectRoot, logPath),
    reason,
  });
}

const mandatoryResults = results.filter((result) => result.mandatory);
const checksStatus = mandatoryResults.length > 0 && mandatoryResults.every((result) => result.status === "PASS")
  ? "PASS"
  : "FAIL";

let baseline = null;
const baselinePath = join(logsDir, "latest-baseline.json");
if (mode === "validate") {
  try {
    const previous = JSON.parse(readFileSync(baselinePath, "utf8"));
    baseline = {
      status: previous.status,
      startedAt: previous.startedAt,
      resultFile: previous.resultFile,
    };
  } catch {
    baseline = { status: "MISSING", startedAt: null, resultFile: null };
  }
}

const overallStatus = checksStatus === "PASS" && (mode === "baseline" || baseline?.status === "PASS")
  ? "PASS"
  : "FAIL";

const resultPath = join(runDir, "result.json");
const document = {
  schemaVersion: 1,
  mode,
  attempt,
  retryLimit: config.retryLimit,
  startedAt,
  finishedAt: new Date().toISOString(),
  status: overallStatus,
  project: {
    branch: git(["branch", "--show-current"]),
    head: git(["rev-parse", "HEAD"]),
    workingTree: git(["status", "--short"]),
  },
  baseline,
  results,
  resultFile: relative(projectRoot, resultPath),
};
writeFileSync(resultPath, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600 });

const latestPath = join(logsDir, mode === "baseline" ? "latest-baseline.json" : "latest-validation.json");
copyFileSync(resultPath, latestPath);

console.log(`AUTOIMPROVE ${mode.toUpperCase()}: ${overallStatus}`);
for (const result of results) {
  const suffix = result.log ? ` (${result.log})` : result.reason ? ` (${result.reason})` : "";
  console.log(`- ${result.id}: ${result.status}${result.mandatory ? " [mandatory]" : " [optional]"}${suffix}`);
}
console.log(`Result: ${relative(projectRoot, resultPath)}`);

process.exit(overallStatus === "PASS" ? 0 : 1);
