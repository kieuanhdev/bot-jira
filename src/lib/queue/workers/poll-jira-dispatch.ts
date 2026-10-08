import {
  listSyncEnabledProjectKeys,
  normalizeProjectKey,
  isValidProjectKeyFormat,
} from "@/lib/jira/project-catalog";
import { registerAccessibleConfiguredProjects } from "@/lib/jira/project-access";
import { enqueueJiraProjectSync } from "@/lib/queue/boss";
import type { WorkerLog } from "../guard";
import type { JiraSyncSource } from "./poll-jira";

export type PollJiraDispatchJobData = {
  full?: boolean;
  source?: "schedule" | "startup" | "admin";
  requestedBy?: string;
  projectKeys?: string[];
};

export async function runPollJiraDispatch(data: PollJiraDispatchJobData = {}): Promise<WorkerLog> {
  // Pick up configured projects that a stored account can read but the catalog lacks.
  await registerAccessibleConfiguredProjects().catch((err) =>
    console.warn("[poll-jira-dispatch] project auto-discovery failed:", err instanceof Error ? err.message : err)
  );

  const rawProjects = data.projectKeys && data.projectKeys.length > 0
    ? data.projectKeys
    : await listSyncEnabledProjectKeys();

  // Normalize and dedupe
  const seen = new Set<string>();
  const projects: string[] = [];
  for (const raw of rawProjects) {
    const key = normalizeProjectKey(raw);
    if (!key || seen.has(key)) continue;
    // Validate project key format
    if (!isValidProjectKeyFormat(key)) {
      continue;
    }
    seen.add(key);
    projects.push(key);
  }

  if (projects.length === 0) {
    return { ok: false, errors: ["No valid Jira projects to dispatch"] };
  }

  let queued = 0;
  let coalesced = 0;
  let rejected = 0;
  const errors: string[] = [];

  const source: JiraSyncSource = data.source ?? "schedule";
  const requestedAt = new Date().toISOString();

  for (const projectKey of projects) {
    try {
      const jobId = await enqueueJiraProjectSync({
        projectKey,
        full: Boolean(data.full),
        source,
        requestedBy: data.requestedBy,
        requestedAt,
      });
      if (jobId) {
        queued++;
      } else {
        coalesced++;
      }
    } catch (err) {
      rejected++;
      errors.push(`${projectKey}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const ok = rejected === 0;

  console.info(
    JSON.stringify({
      level: ok ? "info" : "warn",
      job: "poll-jira-dispatch",
      source,
      requestedBy: data.requestedBy ?? null,
      requested: projects.length,
      queued,
      coalesced,
      rejected,
      projects,
      ok,
    })
  );

  return {
    ok,
    stats: {
      requested: projects.length,
      queued,
      coalesced,
      rejected,
      projects,
      source,
    },
    ...(errors.length > 0 ? { errors } : {}),
  };
}
