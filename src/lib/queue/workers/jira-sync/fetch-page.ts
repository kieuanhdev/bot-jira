import type { JiraSyncClient, JiraSyncPage } from "./types";

export async function fetchPage(
  jira: JiraSyncClient,
  jql: string,
  page: number,
  pageSize: number,
  extraPeopleFields: string[],
  signal: AbortSignal | undefined,
  renewAndAssert: () => Promise<void>,
  options?: { includeComments?: boolean }
): Promise<JiraSyncPage> {
  await renewAndAssert();
  if (options?.includeComments === false) {
    return jira.search(jql, pageSize, page * pageSize, signal, extraPeopleFields, options);
  }
  if (extraPeopleFields.length > 0) {
    return jira.search(jql, pageSize, page * pageSize, signal, extraPeopleFields);
  }
  return jira.search(jql, pageSize, page * pageSize, ...(signal ? [signal] : []));
}
