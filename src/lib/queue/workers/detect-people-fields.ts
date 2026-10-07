import { listSyncEnabledProjectKeys } from "@/lib/jira/project-catalog";
import { detectPeopleFields } from "@/lib/jira/people-fields";
import type { WorkerLog } from "../guard";

export async function runDetectPeopleFields(): Promise<WorkerLog> {
  const projects = await listSyncEnabledProjectKeys();
  const errors: string[] = [];
  let detected = 0;
  for (const projectKey of projects) {
    try {
      await detectPeopleFields(projectKey);
      detected++;
    } catch (error) {
      errors.push(`${projectKey}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { ok: errors.length === 0, stats: { checked: projects.length, detected }, errors };
}
