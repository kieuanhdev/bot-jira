import { createDecipheriv } from "crypto";
import pg from "pg";

const { Client } = pg;

const keyHex = "6abbc2ebbfdeda745d2d79b88f13cb0a9fe07f758690a30f006660b2da600d0e";
const key = Buffer.from(keyHex, "hex");
const ct = "Jo1zW/ffQylkHK0jZ8wtAMyi9b3wsQFiGh4eRZXg1TXr6aoohuhot7873NR8KLxnbfB8C8qq69xxtSV4Zsj97AU3YMofGgK8";
const buf = Buffer.from(ct, "base64");
const iv = buf.subarray(0, 12);
const tag = buf.subarray(12, 28);
const data = buf.subarray(28);
const decipher = createDecipheriv("aes-256-gcm", key, iv);
decipher.setAuthTag(tag);
const token = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");

// Connect to postgres on localhost:5433
const db = new Client({
  connectionString: "postgresql://teamweb:teamweb@localhost:5433/teamweb",
});

async function main() {
  await db.connect();
  console.log("Connected to PostgreSQL");

  const res = await db.query(
    `SELECT "jiraKey" FROM "IssueCache" WHERE "statusCategory" = 'done' AND "points" IS NOT NULL AND "points" > 0;`
  );
  const keys = res.rows.map((r) => r.jiraKey);
  console.log(`Found ${keys.length} done issues with points`);

  // Batch in chunks of 50
  const CHUNK_SIZE = 50;
  let updatedCount = 0;

  for (let i = 0; i < keys.length; i += CHUNK_SIZE) {
    const chunk = keys.slice(i, i + CHUNK_SIZE);
    const jql = `issuekey in (${chunk.join(",")})`;
    const url = "https://jira-sds.softdreams.vn:8080/rest/api/2/search";

    // Call Jira via internal agent or with NODE_TLS_REJECT_UNAUTHORIZED=0
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

    const jiraRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({
        jql,
        maxResults: CHUNK_SIZE,
        fields: ["customfield_10706", "resolutiondate", "status"],
      }),
    });

    if (!jiraRes.ok) {
      console.error(`Jira error for chunk ${i}: ${jiraRes.status} ${jiraRes.statusText}`);
      continue;
    }

    const jiraData = await jiraRes.json();
    for (const issue of jiraData.issues || []) {
      const doneAtStr = issue.fields?.customfield_10706; // Done At
      const resolutionDateStr = issue.fields?.resolutiondate; // Resolved
      const effectiveDateStr = doneAtStr || resolutionDateStr;

      if (effectiveDateStr) {
        const effectiveDate = new Date(effectiveDateStr);
        await db.query(
          `UPDATE "IssueCache"
           SET "statusChangedAt" = $1,
               raw = jsonb_set(
                 jsonb_set(COALESCE(raw, '{}'::jsonb), '{customfield_10706}', $2::jsonb, true),
                 '{resolutiondate}', $3::jsonb, true
               )
           WHERE "jiraKey" = $4;`,
          [
            effectiveDate.toISOString(),
            doneAtStr ? JSON.stringify(doneAtStr) : "null",
            resolutionDateStr ? JSON.stringify(resolutionDateStr) : "null",
            issue.key,
          ]
        );
        updatedCount++;
      }
    }
    console.log(`Processed chunk ${i + 1} - ${Math.min(i + CHUNK_SIZE, keys.length)} (updated: ${updatedCount})`);
  }

  console.log(`Successfully backfilled Done At for ${updatedCount} issues!`);
  await db.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
