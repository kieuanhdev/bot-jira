export type JiraRecoveryResult = {
  requested: number;
  queued: number;
  coalesced: number;
  failed: number;
  errors: string[];
};

export async function enqueueJiraRecoveries(
  projectKeys: string[],
  enqueue: (projectKey: string) => Promise<string | null>
): Promise<JiraRecoveryResult> {
  const projects = [...new Set(projectKeys.map((key) => key.trim().toUpperCase()).filter(Boolean))].sort();
  const result: JiraRecoveryResult = {
    requested: projects.length,
    queued: 0,
    coalesced: 0,
    failed: 0,
    errors: [],
  };

  for (const projectKey of projects) {
    try {
      const jobId = await enqueue(projectKey);
      if (jobId) result.queued++;
      else result.coalesced++;
    } catch (error) {
      result.failed++;
      result.errors.push(`${projectKey}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return result;
}
