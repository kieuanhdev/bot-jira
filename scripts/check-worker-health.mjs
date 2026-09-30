#!/usr/bin/env node
import pg from "pg";
import { evaluateWorkerHeartbeat } from "../src/lib/health/evaluate-worker-heartbeat.ts";

export { evaluateWorkerHeartbeat };

export async function fetchWorkerHeartbeatRow(client) {
  const res = await client.query(
    `SELECT "lastStartedAt", "lastSuccessAt"
     FROM "IntegrationCursor"
     WHERE "integration" = 'worker' AND "scope" = 'liveness'
     LIMIT 1`
  );
  return res?.rows?.[0] ?? null;
}

export async function runHealthCheck(client, nowMs = Date.now()) {
  const row = await fetchWorkerHeartbeatRow(client);
  return evaluateWorkerHeartbeat(row, nowMs);
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("Healthcheck error: DATABASE_URL not set");
    process.exit(1);
  }

  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: 5000,
  });

  try {
    await client.connect();
    const evaluation = await runHealthCheck(client);

    if (!evaluation.healthy) {
      console.error(
        `Healthcheck failed: ${evaluation.reason}${
          evaluation.ageMs !== undefined ? ` (${Math.round(evaluation.ageMs / 1000)}s)` : ""
        }`
      );
      process.exit(1);
    }

    console.log(`Healthcheck OK: Worker heartbeat age is ${Math.round((evaluation.ageMs ?? 0) / 1000)}s`);
    process.exit(0);
  } catch (error) {
    console.error("Healthcheck error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await client.end().catch(() => null);
  }
}

// Execute main only if executed directly
if (process.argv[1] && process.argv[1].endsWith("check-worker-health.mjs")) {
  main();
}
