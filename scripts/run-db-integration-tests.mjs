import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  console.error("TEST_DATABASE_URL is required for DB integration tests.");
  process.exit(1);
}

let parsedUrl;
try {
  parsedUrl = new URL(testDatabaseUrl);
} catch {
  console.error("TEST_DATABASE_URL must be a valid PostgreSQL URL.");
  process.exit(1);
}

const databaseName = decodeURIComponent(parsedUrl.pathname.replace(/^\//, ""));
if (!/^postgres(?:ql)?:$/.test(parsedUrl.protocol) || !/test/i.test(databaseName)) {
  console.error(
    "Refusing to run: TEST_DATABASE_URL must use PostgreSQL and name a database containing 'test'."
  );
  process.exit(1);
}

function databaseIdentity(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return [
      url.protocol,
      url.username,
      url.hostname,
      url.port || "5432",
      decodeURIComponent(url.pathname),
    ].join("|");
  } catch {
    return null;
  }
}

const envFileDatabaseUrl = existsSync(".env")
  ? parse(readFileSync(".env")).DATABASE_URL
  : undefined;
const testDatabaseIdentity = databaseIdentity(testDatabaseUrl);
const developmentIdentities = [
  databaseIdentity(process.env.DATABASE_URL),
  databaseIdentity(envFileDatabaseUrl),
].filter(Boolean);

if (developmentIdentities.includes(testDatabaseIdentity)) {
  console.error("Refusing to run: TEST_DATABASE_URL must differ from DATABASE_URL.");
  process.exit(1);
}

const childEnvironment = {
  ...process.env,
  DATABASE_URL: testDatabaseUrl,
  NODE_ENV: "test",
};

function run(command, args) {
  const result = spawnSync(command, args, {
    env: childEnvironment,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("npx", ["prisma", "migrate", "deploy"]);
run("npx", ["vitest", "run", "--config", "vitest.integration.config.ts"]);
