import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const autoImproveDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(autoImproveDir);
const configPath = resolve(autoImproveDir, "config.json");
const logsDir = resolve(autoImproveDir, "logs");
const baselinePath = resolve(logsDir, "latest-baseline.json");
const mode = process.argv[2];
const rawArgs = process.argv.slice(3);

if (!new Set(["baseline", "validate"]).has(mode)) {
  console.error(
    "Usage: ./autoimprove/validate.sh <baseline|validate> --profile=<fast|full> " +
      "--category=<category> --file=<path> [--file=<path> ...] [--test=<path> ...] [--attempt=N]",
  );
  process.exit(2);
}

function failConfig(message) {
  console.error(`AutoImprove configuration error: ${message}`);
  process.exit(2);
}

function readOption(name) {
  return rawArgs.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function readOptions(name) {
  return rawArgs
    .filter((arg) => arg.startsWith(`--${name}=`))
    .map((arg) => arg.slice(name.length + 3));
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

let config;
let configText;
try {
  configText = readFileSync(configPath, "utf8");
  config = JSON.parse(configText);
} catch (error) {
  failConfig(error instanceof Error ? error.message : String(error));
}

if (!Number.isInteger(config.retryLimit) || config.retryLimit < 0) {
  failConfig("retryLimit must be a non-negative integer");
}
if (!Number.isInteger(config.timeoutMs) || config.timeoutMs <= 0) {
  failConfig("timeoutMs must be a positive integer");
}
if (!Number.isInteger(config.baselineCacheMaxAgeMinutes) || config.baselineCacheMaxAgeMinutes < 0) {
  failConfig("baselineCacheMaxAgeMinutes must be a non-negative integer");
}
if (!Array.isArray(config.checks) || config.checks.length === 0) {
  failConfig("checks must be a non-empty array");
}
if (!Array.isArray(config.validationCategories) || config.validationCategories.length === 0) {
  failConfig("validationCategories must be a non-empty array");
}
if (
  !Array.isArray(config.fullProfileCategories) ||
  config.fullProfileCategories.some((item) => !config.validationCategories.includes(item))
) {
  failConfig("fullProfileCategories must contain only configured validation categories");
}

const profiles = new Set(["fast", "full"]);
const profile = readOption("profile") || config.defaultProfile;
if (!profiles.has(profile)) failConfig(`unknown profile: ${profile}`);
const category = readOption("category");
if (!category || !config.validationCategories.includes(category)) {
  failConfig(`--category must be one of: ${config.validationCategories.join(", ")}`);
}
if (profile === "fast" && config.fullProfileCategories.includes(category)) {
  failConfig(`category ${category} requires the full profile`);
}

const attemptText = readOption("attempt");
const attempt = attemptText === undefined ? 0 : Number(attemptText);
if (!Number.isInteger(attempt) || attempt < 0) {
  failConfig("--attempt must be a non-negative integer");
}
if (mode === "validate" && attempt > config.retryLimit) {
  failConfig(`attempt ${attempt} exceeds retryLimit ${config.retryLimit}`);
}

function normalizeWorkspacePath(input, option) {
  if (!input || input.includes("\0") || isAbsolute(input)) {
    failConfig(`--${option} must be a non-empty workspace-relative path`);
  }
  const normalized = normalize(input).replaceAll("\\", "/").replace(/^\.\//, "");
  const absolute = resolve(projectRoot, normalized);
  if (normalized === ".." || normalized.startsWith("../") || !absolute.startsWith(`${projectRoot}/`)) {
    failConfig(`--${option} escapes the workspace: ${input}`);
  }
  return normalized;
}

const targetFiles = uniqueSorted(readOptions("file").map((value) => normalizeWorkspacePath(value, "file")));
const targetTests = uniqueSorted(readOptions("test").map((value) => normalizeWorkspacePath(value, "test")));
if (targetFiles.length === 0) failConfig("at least one --file is required to define the approved scope");
if (profile === "fast" && targetTests.length === 0) {
  failConfig("the fast profile requires at least one existing focused --test; use full otherwise");
}

const ids = new Set();
for (const check of config.checks) {
  if (!check || typeof check.id !== "string" || !/^[a-z0-9-]+$/.test(check.id)) {
    failConfig("every check needs a lowercase id containing only letters, numbers, and hyphens");
  }
  if (ids.has(check.id)) failConfig(`duplicate check id: ${check.id}`);
  ids.add(check.id);
  if (
    !Array.isArray(check.command) ||
    check.command.length === 0 ||
    check.command.some((part) => typeof part !== "string" || part.length === 0)
  ) {
    failConfig(`check ${check.id} must define command as a non-empty string array`);
  }
  if (!Array.isArray(check.profiles) || check.profiles.some((item) => !profiles.has(item))) {
    failConfig(`check ${check.id} has invalid profiles`);
  }
  if (check.append && !new Set(["files", "tests"]).has(check.append)) {
    failConfig(`check ${check.id} has invalid append value`);
  }
  if (typeof check.mandatory !== "boolean" || typeof check.enabled !== "boolean") {
    failConfig(`check ${check.id} must define boolean mandatory and enabled values`);
  }
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const runName = `${timestamp}-${mode}-${profile}-${category}-attempt-${attempt}`;
const runDir = resolve(logsDir, runName);
mkdirSync(runDir, { recursive: true });

const packageJson = JSON.parse(readFileSync(resolve(projectRoot, "package.json"), "utf8"));
const gitRun = (args, options = {}) =>
  spawnSync("git", args, {
    cwd: projectRoot,
    encoding: options.encoding ?? "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
const git = (args) => {
  const result = gitRun(args);
  return result.status === 0 ? result.stdout.trim() : null;
};

function isSensitivePath(path) {
  const name = path.split("/").at(-1) || "";
  return (name === ".env" || name.startsWith(".env.")) && name !== ".env.example";
}

function workspaceSnapshot() {
  const listed = gitRun(["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    encoding: "buffer",
  });
  if (listed.status !== 0) failConfig("unable to list workspace files for baseline fingerprint");

  const paths = listed.stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((path) => path.replaceAll("\\", "/"))
    .filter((path) => !isSensitivePath(path))
    .sort();
  const files = {};
  for (const path of paths) {
    const absolute = resolve(projectRoot, path);
    if (!absolute.startsWith(`${projectRoot}/`)) failConfig(`git returned path outside workspace: ${path}`);
    try {
      const stat = lstatSync(absolute);
      const content = stat.isSymbolicLink() ? `symlink:${readlinkSync(absolute)}` : readFileSync(absolute);
      files[path] = createHash("sha256").update(content).digest("hex");
    } catch (error) {
      failConfig(`unable to fingerprint ${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const head = git(["rev-parse", "HEAD"]);
  const status = git(["status", "--short"]);
  const digest = createHash("sha256").update(JSON.stringify({ head, status, files })).digest("hex");
  return { head, status, digest, files };
}

function changedPaths(before, after) {
  const paths = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...paths].filter((path) => before?.[path] !== after?.[path]).sort();
}

function commandLabel(command) {
  return command
    .map((part) => (/^[A-Za-z0-9_./:@=-]+$/.test(part) ? part : JSON.stringify(part)))
    .join(" ");
}

function unavailableResult(check, command, reason) {
  return {
    id: check.id,
    mandatory: check.mandatory,
    command,
    status: "UNAVAILABLE",
    exitCode: null,
    durationMs: 0,
    log: null,
    reason,
  };
}

function selectedChecks() {
  return config.checks.filter((check) => check.profiles.includes(profile));
}

function checkCommand(check) {
  const appended = check.append === "files" ? targetFiles : check.append === "tests" ? targetTests : [];
  return [...check.command, ...appended];
}

function executeChecks() {
  const results = [];
  for (const check of selectedChecks()) {
    const command = checkCommand(check);
    if (!check.enabled) {
      results.push({
        id: check.id,
        mandatory: check.mandatory,
        command,
        status: "SKIPPED",
        exitCode: null,
        durationMs: 0,
        log: null,
        reason: check.skipReason || "Disabled in autoimprove/config.json",
      });
      continue;
    }

    if (command[0] === "npm" && command[1] === "run") {
      const scriptName = command[2];
      if (!scriptName || !packageJson.scripts?.[scriptName]) {
        results.push(unavailableResult(check, command, `npm script not found: ${scriptName || "(missing)"}`));
        continue;
      }
    }

    const checkStarted = Date.now();
    const execution = spawnSync(command[0], command.slice(1), {
      cwd: projectRoot,
      encoding: "utf8",
      env: process.env,
      maxBuffer: 50 * 1024 * 1024,
      timeout: config.timeoutMs,
    });
    const durationMs = Date.now() - checkStarted;
    const logPath = resolve(runDir, `${check.id}.log`);
    writeFileSync(
      logPath,
      [`$ ${commandLabel(command)}`, "", execution.stdout || "", execution.stderr || ""].join("\n"),
      { mode: 0o600 },
    );

    let status = execution.status === 0 ? "PASS" : "FAIL";
    let reason = execution.signal ? `Terminated by signal ${execution.signal}` : null;
    if (execution.error?.code === "ENOENT") {
      status = "UNAVAILABLE";
      reason = `Executable not found: ${command[0]}`;
    } else if (execution.error?.code === "ETIMEDOUT") {
      reason = `Timed out after ${config.timeoutMs}ms`;
    } else if (execution.error && !reason) {
      reason = execution.error.message;
    }

    results.push({
      id: check.id,
      mandatory: check.mandatory,
      command,
      status,
      exitCode: execution.status,
      durationMs,
      log: relative(projectRoot, logPath),
      reason,
    });
  }
  return results;
}

function checksPass(results) {
  const mandatory = results.filter((result) => result.mandatory);
  return mandatory.length > 0 && mandatory.every((result) => result.status === "PASS");
}

function readBaseline() {
  try {
    return JSON.parse(readFileSync(baselinePath, "utf8"));
  } catch {
    return null;
  }
}

function sameTargets(document) {
  return (
    document.profile === profile &&
    document.category === category &&
    JSON.stringify(document.scope?.files || []) === JSON.stringify(targetFiles) &&
    JSON.stringify(document.scope?.tests || []) === JSON.stringify(targetTests)
  );
}

const invocationStarted = Date.now();
const startedAt = new Date(invocationStarted).toISOString();
const configHash = createHash("sha256").update(configText).digest("hex");
const currentSnapshot = workspaceSnapshot();
let results = [];
let status = "FAIL";
let reason = null;
let baseline = null;
let cache = { reused: false, sourceResult: null };
let changeSet = [];

if (mode === "baseline") {
  const previous = readBaseline();
  const ageMs = previous ? invocationStarted - Date.parse(previous.finishedAt) : Number.POSITIVE_INFINITY;
  const cacheValid =
    previous?.status === "PASS" &&
    previous.configHash === configHash &&
    previous.project?.snapshot?.digest === currentSnapshot.digest &&
    sameTargets(previous) &&
    ageMs >= 0 &&
    ageMs <= config.baselineCacheMaxAgeMinutes * 60_000;

  if (cacheValid) {
    results = previous.results;
    status = "PASS";
    cache = { reused: true, sourceResult: previous.resultFile };
  } else {
    results = executeChecks();
    status = checksPass(results) ? "PASS" : "FAIL";
  }
} else {
  const previous = readBaseline();
  baseline = previous
    ? {
        status: previous.status,
        startedAt: previous.startedAt,
        resultFile: previous.resultFile,
        head: previous.project?.head ?? null,
        profile: previous.profile,
        category: previous.category,
      }
    : { status: "MISSING", startedAt: null, resultFile: null, head: null, profile: null, category: null };

  if (!previous || previous.status !== "PASS") {
    status = "BLOCKED";
    reason = "A passing baseline is required before validation.";
  } else if (previous.configHash !== configHash) {
    status = "BLOCKED";
    reason = "Validation config changed after baseline; run baseline again.";
  } else if (!sameTargets(previous)) {
    status = "BLOCKED";
    reason = "Validation category, profile, or approved file/test scope differs from baseline.";
  } else if (previous.project?.head !== currentSnapshot.head) {
    status = "BLOCKED";
    reason = `HEAD changed after baseline (${previous.project?.head} -> ${currentSnapshot.head}).`;
  } else {
    changeSet = changedPaths(previous.project?.snapshot?.files, currentSnapshot.files);
    const outsideScope = changeSet.filter((path) => !targetFiles.includes(path));
    if (changeSet.length === 0) {
      status = "BLOCKED";
      reason = "No file changed after baseline; there is no improvement to validate.";
    } else if (outsideScope.length > 0) {
      status = "BLOCKED";
      reason = `Files changed outside approved scope: ${outsideScope.join(", ")}`;
    } else {
      results = executeChecks();
      status = checksPass(results) ? "PASS" : "FAIL";
    }
  }
}

const resultPath = resolve(runDir, "result.json");
const finishedAt = new Date().toISOString();
const document = {
  schemaVersion: 3,
  mode,
  profile,
  category,
  attempt,
  retryLimit: config.retryLimit,
  startedAt,
  finishedAt,
  durationMs: Date.now() - invocationStarted,
  status,
  reason,
  configHash,
  scope: { files: targetFiles, tests: targetTests },
  changeSet,
  project: {
    branch: git(["branch", "--show-current"]),
    head: currentSnapshot.head,
    workingTree: currentSnapshot.status,
    snapshot: currentSnapshot,
  },
  baseline,
  cache,
  results,
  resultFile: relative(projectRoot, resultPath),
};
writeFileSync(resultPath, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600 });

const latestPath = resolve(logsDir, mode === "baseline" ? "latest-baseline.json" : "latest-validation.json");
copyFileSync(resultPath, latestPath);

console.log(
  `AUTOIMPROVE ${mode.toUpperCase()} [${category.toUpperCase()}/${profile.toUpperCase()}]: ${status}`,
);
if (cache.reused) console.log(`- baseline cache: REUSED (${cache.sourceResult})`);
if (reason) console.log(`- reason: ${reason}`);
for (const result of results) {
  const suffix = result.log ? ` (${result.log})` : result.reason ? ` (${result.reason})` : "";
  console.log(
    `- ${result.id}: ${result.status}${result.mandatory ? " [mandatory]" : " [optional]"}${suffix}`,
  );
}
console.log(`- duration: ${document.durationMs}ms`);
console.log(`Result: ${relative(projectRoot, resultPath)}`);

process.exit(status === "PASS" ? 0 : 1);
