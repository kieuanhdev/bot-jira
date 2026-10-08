import { jiraWith, type JiraAuth } from "./client";
import {
  discoverJiraProjectAccess,
  registerAccessibleConfiguredProjects,
  resetJiraAccessCache,
} from "./project-access";

export type JiraOnboarding = {
  /** Projects the new token can read. */
  readable: number;
  /** Configured projects that were missing from the catalog and are now syncing. */
  registered: string[];
};

/**
 * Called when someone saves a Jira token: re-checks which projects every stored
 * account can read, and registers configured projects that were previously
 * unreachable so they start syncing with the account that can read them.
 */
export async function onboardJiraToken(auth: JiraAuth): Promise<JiraOnboarding> {
  const mine = await jiraWith(auth).getProjects().catch(() => []);
  resetJiraAccessCache();
  await discoverJiraProjectAccess(true);
  const registered = await registerAccessibleConfiguredProjects();
  return { readable: mine.length, registered };
}
