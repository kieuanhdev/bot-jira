import { JiraRequestError } from "../errors";
import type {
  CreateIssueInput,
  CreateIssueResult,
  JiraComment,
  JiraCommentPage,
  JiraCreateMetaField,
  JiraCreateMetaFieldsResponse,
  JiraCreateMetaIssueTypesResponse,
  JiraCreateMetaResponse,
  JiraEditMeta,
  JiraFieldDefinition,
  JiraIssue,
  JiraProject,
  JiraSearchResult,
  JiraTransition,
} from "../types";
import type { JiraRequest } from "./types";

type IssueResourceDependencies = {
  request: JiraRequest;
  getPointFields: () => Promise<JiraFieldDefinition[]>;
  configuredPointFields: () => JiraFieldDefinition[];
  issueFields: (extraFields?: string[]) => string;
  knownPointFieldIds: () => string[];
  epicLinkFieldIds: () => string[];
  isPointField: (field: Pick<JiraFieldDefinition, "name" | "schema">) => boolean;
  configuredPointFieldId: string;
};

export function createIssueResource({
  request,
  getPointFields,
  configuredPointFields,
  issueFields,
  knownPointFieldIds,
  epicLinkFieldIds,
  isPointField,
  configuredPointFieldId,
}: IssueResourceDependencies) {
  const resolveEditablePointsField = async (key: string): Promise<JiraFieldDefinition | null> => {
    const meta = await request<JiraEditMeta>(
      `/rest/api/2/issue/${encodeURIComponent(key)}/editmeta`
    );
    const editable = Object.entries(meta.fields ?? {})
      .map(([id, field]) => ({ id, name: field.name, schema: field.schema }))
      .filter(isPointField);
    return editable.find((field) => field.id === configuredPointFieldId) ?? editable[0] ?? null;
  };

  return {
    search: async (
      jql: string,
      maxResults = 50,
      startAt = 0,
      signal?: AbortSignal,
      extraFields: string[] = []
    ) => {
      await getPointFields().catch(() => configuredPointFields());
      const params = new URLSearchParams({
        jql,
        fields: issueFields(extraFields),
        maxResults: String(maxResults),
        startAt: String(startAt),
      });
      return request<JiraSearchResult>(`/rest/api/2/search?${params}`, { signal });
    },

    getIssue: async (key: string, extraFields?: string) => {
      const fields = new URLSearchParams();
      if (extraFields) {
        await getPointFields().catch(() => configuredPointFields());
        const requested = [
          ...extraFields.split(","),
          ...knownPointFieldIds(),
          ...epicLinkFieldIds(),
        ]
          .filter(Boolean)
          .filter((field, index, all) => all.indexOf(field) === index);
        fields.set("fields", requested.join(","));
      }
      const query = fields.toString();
      return request<JiraIssue>(
        `/rest/api/2/issue/${encodeURIComponent(key)}${query ? `?${query}` : ""}`
      );
    },

    getEditMeta: (key: string) =>
      request<JiraEditMeta>(`/rest/api/2/issue/${encodeURIComponent(key)}/editmeta`),

    getFields: getPointFields,

    resolvePointsField: resolveEditablePointsField,

    getCommentsPage: (key: string, startAt = 0, maxResults = 100, signal?: AbortSignal) =>
      request<JiraCommentPage>(
        `/rest/api/2/issue/${encodeURIComponent(key)}/comment?orderBy=created&startAt=${startAt}&maxResults=${maxResults}`,
        { signal }
      ),

    getComments: async (key: string, signal?: AbortSignal) => {
      const comments: JiraComment[] = [];
      const pageSize = 100;
      for (let page = 0; page < 100; page++) {
        if (signal?.aborted) {
          throw new JiraRequestError(`Jira comments fetch aborted for ${key}`, null, false);
        }
        const startAt = page * pageSize;
        const response = await request<JiraCommentPage>(
          `/rest/api/2/issue/${encodeURIComponent(key)}/comment?orderBy=created&startAt=${startAt}&maxResults=${pageSize}`,
          { signal }
        );
        const rows = response.comments ?? response.issues ?? [];
        comments.push(...rows);
        const total = response.total ?? rows.length;
        if (rows.length < pageSize || startAt + rows.length >= total) break;
      }
      return comments;
    },

    getTransitions: async (key: string) => {
      const response = await request<{ transitions: JiraTransition[] }>(
        `/rest/api/2/issue/${encodeURIComponent(key)}/transitions`
      );
      return response.transitions;
    },

    transition: (key: string, transitionId: string, fields?: Record<string, unknown>) =>
      request(`/rest/api/2/issue/${encodeURIComponent(key)}/transitions`, {
        method: "POST",
        body: JSON.stringify({ transition: { id: transitionId }, fields }),
      }),

    findTransition: async (key: string, targetStatus: string) => {
      const response = await request<{ transitions: JiraTransition[] }>(
        `/rest/api/2/issue/${encodeURIComponent(key)}/transitions`
      );
      const target = targetStatus.toLowerCase();
      return (
        response.transitions.find(
          (transition) => transition.to?.name?.toLowerCase() === target
        ) ?? null
      );
    },

    updateIssue: async (
      key: string,
      patch: {
        summary?: string;
        description?: string;
        assignee?: string | null;
        labels?: string[];
        priority?: string;
        issueType?: string;
        points?: number | null;
        fixVersions?: string[];
        dueDate?: string | null;
        originalEstimate?: string;
        epic?: string | null;
        extraFields?: Record<string, unknown>;
      }
    ) => {
      const fields: Record<string, unknown> = { ...(patch.extraFields ?? {}) };
      if (patch.summary !== undefined) fields.summary = patch.summary;
      if (patch.description !== undefined) fields.description = patch.description;
      if (patch.assignee !== undefined) {
        fields.assignee = patch.assignee === null ? null : { name: patch.assignee };
      }
      if (patch.labels !== undefined) fields.labels = patch.labels;
      if (patch.priority !== undefined) fields.priority = { name: patch.priority };
      if (patch.issueType !== undefined) fields.issuetype = { name: patch.issueType };
      if (patch.points !== undefined) {
        const pointField = await resolveEditablePointsField(key);
        if (!pointField) {
          throw new JiraRequestError(
            "Jira issue has no editable Story Points/Task Points field",
            400,
            false
          );
        }
        fields[pointField.id] = patch.points;
      }
      if (patch.fixVersions !== undefined) {
        fields.fixVersions = patch.fixVersions.map((id) => ({ id }));
      }
      if (patch.dueDate !== undefined) fields.duedate = patch.dueDate;
      if (patch.originalEstimate !== undefined) {
        fields.timetracking = { originalEstimate: patch.originalEstimate };
      }
      if (patch.epic !== undefined) {
        let epicFieldId: string | null = null;
        let isParentField = false;
        try {
          const meta = await request<JiraEditMeta>(
            `/rest/api/2/issue/${encodeURIComponent(key)}/editmeta`
          );
          for (const [id, field] of Object.entries(meta.fields ?? {})) {
            const lowerName = field.name?.trim().toLowerCase() ?? "";
            if (
              (field.schema as { custom?: string })?.custom ===
                "com.pyxis.greenhopper.jira:gh-epic-link" ||
              lowerName === "epic link" ||
              lowerName === "epic"
            ) {
              epicFieldId = id;
              break;
            }
            if (id === "parent" || field.schema?.system === "parent") {
              epicFieldId = id;
              isParentField = true;
            }
          }
        } catch {
          // Keep the existing fallback to Jira's parent field.
        }

        if (epicFieldId && !isParentField) {
          fields[epicFieldId] = patch.epic;
        } else {
          fields.parent = patch.epic ? { key: patch.epic } : null;
        }
      }
      if (Object.keys(fields).length === 0) return;
      return request(`/rest/api/2/issue/${encodeURIComponent(key)}`, {
        method: "PUT",
        body: JSON.stringify({ fields }),
      });
    },

    createIssue: (data: CreateIssueInput) => {
      const fields: Record<string, unknown> = {
        project: { key: data.projectKey },
        summary: data.summary,
        issuetype: data.issueTypeId
          ? { id: data.issueTypeId }
          : { name: data.issueType ?? "Bug" },
        ...(data.fields ?? {}),
      };
      if (data.description !== undefined) fields.description = data.description;
      if (data.assignee !== undefined) {
        fields.assignee = data.assignee ? { name: data.assignee } : null;
      }
      if (data.priorityId) {
        fields.priority = { id: data.priorityId };
      } else if (data.priority) {
        fields.priority = { name: data.priority };
      }

      const labels = new Set<string>(data.labels ?? []);
      if (data.idempotencyMarker) labels.add(data.idempotencyMarker);
      if (labels.size > 0 || data.labels !== undefined || data.idempotencyMarker) {
        fields.labels = Array.from(labels);
      }

      return request<CreateIssueResult>("/rest/api/2/issue", {
        method: "POST",
        body: JSON.stringify({ fields }),
      });
    },

    getCreateMetaIssueTypes: (
      projectKey: string
    ): Promise<JiraCreateMetaIssueTypesResponse> =>
      request<JiraCreateMetaIssueTypesResponse>(
        `/rest/api/2/issue/createmeta/${encodeURIComponent(projectKey)}/issuetypes`
      ),

    getCreateMetaFields: (
      projectKey: string,
      issueTypeId: string
    ): Promise<JiraCreateMetaFieldsResponse> =>
      request<JiraCreateMetaFieldsResponse>(
        `/rest/api/2/issue/createmeta/${encodeURIComponent(projectKey)}/issuetypes/${encodeURIComponent(issueTypeId)}`
      ),

    getCreateMetadata: async (
      projectKey: string,
      issueTypeId?: string
    ): Promise<JiraCreateMetaResponse> => {
      try {
        let url = `/rest/api/2/issue/createmeta?projectKeys=${encodeURIComponent(projectKey)}&expand=projects.issuetypes.fields`;
        if (issueTypeId) url += `&issuetypeIds=${encodeURIComponent(issueTypeId)}`;
        return await request<JiraCreateMetaResponse>(url);
      } catch (error: unknown) {
        if ((error as JiraRequestError)?.status !== 404) throw error;

        const project = await request<JiraProject>(
          `/rest/api/2/project/${encodeURIComponent(projectKey)}`
        );
        const typesResponse = await request<JiraCreateMetaIssueTypesResponse>(
          `/rest/api/2/issue/createmeta/${encodeURIComponent(projectKey)}/issuetypes`
        );
        const filteredTypes = issueTypeId
          ? (typesResponse.values || []).filter((type) => type.id === issueTypeId)
          : typesResponse.values || [];

        const issueTypesWithFields = await Promise.all(
          filteredTypes.map(async (type) => {
            try {
              const fieldsResponse = await request<JiraCreateMetaFieldsResponse>(
                `/rest/api/2/issue/createmeta/${encodeURIComponent(projectKey)}/issuetypes/${encodeURIComponent(type.id)}`
              );
              const fields: Record<string, JiraCreateMetaField> = {};
              for (const field of fieldsResponse.values || []) {
                const legacy = field as { key?: string; id?: string };
                const id = field.fieldId || legacy.key || legacy.id;
                if (id) fields[id] = field;
              }
              return { ...type, fields };
            } catch {
              return { ...type, fields: {} };
            }
          })
        );

        return {
          projects: [
            {
              id: project.id || "",
              key: project.key,
              name: project.name,
              issuetypes: issueTypesWithFields,
            },
          ],
        };
      }
    },

    findIssueByBulkMarker: async (
      projectKey: string,
      marker: string
    ): Promise<JiraIssue | null> => {
      const jql = `project = "${projectKey.replace(/"/g, '\\"')}" AND labels = "${marker.replace(/"/g, '\\"')}"`;
      const response = await request<JiraSearchResult>(
        `/rest/api/2/search?jql=${encodeURIComponent(jql)}&maxResults=5&fields=id,key,summary,status`
      );
      if (!response.issues || response.issues.length === 0) return null;
      if (response.issues.length > 1) {
        throw new JiraRequestError(
          `Tìm thấy nhiều hơn một issue cho marker ${marker}`,
          409,
          false
        );
      }
      return response.issues[0];
    },

    removeIssueLabel: async (key: string, label: string): Promise<void> => {
      try {
        await request(`/rest/api/2/issue/${encodeURIComponent(key)}`, {
          method: "PUT",
          body: JSON.stringify({ update: { labels: [{ remove: label }] } }),
        });
      } catch {
        try {
          const issue = await request<{ fields?: { labels?: string[] } }>(
            `/rest/api/2/issue/${encodeURIComponent(key)}?fields=labels`
          );
          const currentLabels = issue?.fields?.labels ?? [];
          if (currentLabels.includes(label)) {
            await request(`/rest/api/2/issue/${encodeURIComponent(key)}`, {
              method: "PUT",
              body: JSON.stringify({
                fields: { labels: currentLabels.filter((current) => current !== label) },
              }),
            });
          }
        } catch {
          // Preserve best-effort cleanup semantics.
        }
      }
    },

    addComment: (key: string, body: string) =>
      request<JiraComment>(`/rest/api/2/issue/${encodeURIComponent(key)}/comment`, {
        method: "POST",
        body: JSON.stringify({ body }),
      }),

    searchParentIssues: async (
      projectKey: string,
      query: string,
      limit: number
    ): Promise<Array<{ key: string; summary: string; issueTypeName: string; status: string }>> => {
      const maxResults = Math.min(Math.max(1, limit), 50);
      let jql: string;
      if (query) {
        if (/^[A-Z][A-Z0-9_]+-\d+$/.test(query)) {
          jql = `project = "${projectKey}" AND key = "${query}" AND "issuetype" != "Sub-task"`;
        } else {
          const escaped = query.replace(/"/g, '\\"');
          jql = `project = "${projectKey}" AND (key ~ "${escaped}" OR summary ~ "${escaped}") AND "issuetype" != "Sub-task"`;
        }
      } else {
        jql = `project = "${projectKey}" AND "issuetype" != "Sub-task" ORDER BY key DESC`;
      }

      const response = await request<JiraSearchResult>(
        `/rest/api/2/search?jql=${encodeURIComponent(jql)}&maxResults=${maxResults}&fields=summary,issuetype,status`
      );
      return (response.issues ?? [])
        .filter((issue) => issue.fields.issuetype?.name?.toLowerCase() !== "sub-task")
        .map((issue) => ({
          key: issue.key,
          summary: issue.fields.summary ?? "",
          issueTypeName: issue.fields.issuetype?.name ?? "Unknown",
          status: issue.fields.status?.name ?? "Unknown",
        }));
    },

    searchTemplateIssues: async (
      projectKey: string,
      query: string,
      limit: number
    ): Promise<
      Array<{
        key: string;
        summary: string;
        issueTypeName: string;
        issueTypeId: string;
        isSubtask: boolean;
        parentKey?: string;
        parentSummary?: string;
        status: string;
        assignee?: string;
        updated?: string;
      }>
    > => {
      const maxResults = Math.min(Math.max(1, limit), 50);
      let jql: string;
      if (query) {
        if (/^[A-Z][A-Z0-9_]+-\d+$/i.test(query)) {
          jql = `project = "${projectKey}" AND key = "${query.toUpperCase()}"`;
        } else {
          const escaped = query.replace(/["\\]/g, "\\$&");
          jql = `project = "${projectKey}" AND (key ~ "${escaped}*" OR summary ~ "${escaped}") ORDER BY updated DESC`;
        }
      } else {
        jql = `project = "${projectKey}" ORDER BY updated DESC`;
      }

      let response: JiraSearchResult;
      try {
        response = await request<JiraSearchResult>(
          `/rest/api/2/search?jql=${encodeURIComponent(jql)}&maxResults=${maxResults}&fields=summary,issuetype,status,assignee,updated,parent`
        );
      } catch {
        const fallbackJql = query
          ? `project = "${projectKey}" AND summary ~ "${query.replace(/["\\]/g, "\\$&")}" ORDER BY updated DESC`
          : `project = "${projectKey}" ORDER BY updated DESC`;
        response = await request<JiraSearchResult>(
          `/rest/api/2/search?jql=${encodeURIComponent(fallbackJql)}&maxResults=${maxResults}&fields=summary,issuetype,status,assignee,updated,parent`
        );
      }

      return (response.issues ?? []).map((issue) => {
        const isSubtask =
          (issue.fields.issuetype as { subtask?: boolean } | undefined)?.subtask === true ||
          issue.fields.issuetype?.name?.toLowerCase() === "sub-task" ||
          Boolean(issue.fields.parent);
        const parent = issue.fields.parent as
          | { key?: string; fields?: { summary?: string } }
          | undefined;
        return {
          key: issue.key,
          summary: issue.fields.summary ?? "",
          issueTypeId: issue.fields.issuetype?.id ?? "",
          issueTypeName: issue.fields.issuetype?.name ?? "Unknown",
          isSubtask,
          parentKey: parent?.key,
          parentSummary: parent?.fields?.summary,
          status: issue.fields.status?.name ?? "Unknown",
          assignee: issue.fields.assignee?.displayName ?? issue.fields.assignee?.name,
          updated: issue.fields.updated,
        };
      });
    },
  };
}
