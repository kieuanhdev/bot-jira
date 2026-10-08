import type { JiraVersion } from "../types";
import type { JiraRequest } from "./types";

export function createVersionResource(request: JiraRequest) {
  return {
    resolveVersionId: async (projectKey: string, name: string): Promise<string | null> => {
      const versions = await request<JiraVersion[]>(
        `/rest/api/2/project/${encodeURIComponent(projectKey)}/versions`
      );
      const match = versions.find((version) => version.name.toLowerCase() === name.toLowerCase());
      return match?.id ?? null;
    },

    getVersions: (projectKey: string) =>
      request<JiraVersion[]>(
        `/rest/api/2/project/${encodeURIComponent(projectKey)}/versions`
      ),

    getVersion: (versionId: string) =>
      request<JiraVersion>(`/rest/api/2/version/${encodeURIComponent(versionId)}`),

    createVersion: (projectKey: string, name: string, description?: string) =>
      request<JiraVersion>("/rest/api/2/version", {
        method: "POST",
        body: JSON.stringify({ name, description, project: projectKey }),
      }),

    updateVersion: (
      versionId: string,
      data: { name?: string; description?: string; releaseDate?: string | null }
    ) =>
      request<JiraVersion>(`/rest/api/2/version/${encodeURIComponent(versionId)}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),

    releaseVersion: (versionId: string) =>
      request<JiraVersion>(`/rest/api/2/version/${encodeURIComponent(versionId)}`, {
        method: "PUT",
        body: JSON.stringify({
          released: true,
          releaseDate: new Date().toISOString().slice(0, 10),
        }),
      }),
  };
}
