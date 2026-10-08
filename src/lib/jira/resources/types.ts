export type JiraRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

export type JiraResourceTransport = {
  request: JiraRequest;
  requestOnce: JiraRequest;
};
