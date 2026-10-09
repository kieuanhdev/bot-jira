import { createHash } from "crypto";
import {
  type jiraWith,
  JiraRequestError,
  type JiraAuth,
} from "@/lib/jira/client";
import type {
  JiraCreateMetaResponse,
  JiraCreateMetaField,
} from "@/lib/jira/types";
import { env } from "@/lib/env";
import type { BulkCreateProjectMetadata } from "./create-types";

export const METADATA_CACHE_TTL_MS = 5 * 60 * 1000;

const metadataCache = new Map<
  string,
  { meta: BulkCreateProjectMetadata; expiresAt: number }
>();

export function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function buildMetadataCacheKey(projectKey: string, userAuth: Partial<JiraAuth>): string {
  const tokenHash = userAuth.token ? sha256(userAuth.token).slice(0, 8) : "anon";
  return `${tokenHash}:${projectKey.toUpperCase()}`;
}

export function clearBulkCreateMetadataCache(): void {
  metadataCache.clear();
}

export function invalidateBulkCreateMetadataCache(projectKey?: string, userToken?: string): void {
  if (!projectKey && !userToken) {
    metadataCache.clear();
    return;
  }
  const prefix = userToken ? sha256(userToken).slice(0, 8) : undefined;
  const upperProj = projectKey ? projectKey.toUpperCase() : undefined;
  for (const key of Array.from(metadataCache.keys())) {
    const [tokenPart, projPart] = key.split(":");
    const matchToken = !prefix || tokenPart === prefix;
    const matchProj = !upperProj || projPart === upperProj;
    if (matchToken && matchProj) {
      metadataCache.delete(key);
    }
  }
}

export function getBulkCreateMetadataCacheSize(): number {
  return metadataCache.size;
}

export interface FetchBulkCreateMetadataOptions {
  forceRefresh?: boolean;
  ttlMs?: number;
}

/**
 * Fetch and adapt Jira Data Center create metadata for a given project.
 */
export async function fetchBulkCreateMetadata(
  jira: ReturnType<typeof jiraWith>,
  projectKey: string,
  userAuth: JiraAuth,
  options?: FetchBulkCreateMetadataOptions
): Promise<BulkCreateProjectMetadata> {
  const normalizedKey = projectKey.trim().toUpperCase();
  const cacheKey = buildMetadataCacheKey(normalizedKey, userAuth);

  if (!options?.forceRefresh) {
    const cached = metadataCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.meta;
    }
  }

  // 1. Fetch create metadata
  let createmeta: JiraCreateMetaResponse;
  try {
    createmeta = await jira.getCreateMetadata(normalizedKey);
  } catch (err) {
    throw new JiraRequestError(
      `Không thể lấy metadata tạo task cho dự án ${normalizedKey}: ${(err as Error).message}`,
      (err as JiraRequestError).status ?? 500,
      (err as JiraRequestError).retryable ?? false
    );
  }

  const proj = createmeta.projects?.find(
    (p) => p.key.toUpperCase() === normalizedKey
  );
  if (!proj) {
    throw new JiraRequestError(
      `Dự án ${normalizedKey} không tồn tại hoặc bạn không có quyền truy cập`,
      404,
      false
    );
  }

  // 2. Check CREATE_ISSUES permission
  let canCreate = false;
  let permissionReason: string | undefined;
  try {
    const myPerms = await jira.getMyPermissions(normalizedKey);
    const createPerm = myPerms.permissions?.CREATE_ISSUES;
    canCreate = Boolean(createPerm?.havePermission);
    if (!canCreate) {
      permissionReason = "Tài khoản của bạn không có quyền tạo task (CREATE_ISSUES) trong dự án này.";
    }
  } catch {
    // If permissions check fails, fallback to canCreate = true if issuetypes are returned
    canCreate = (proj.issuetypes?.length ?? 0) > 0;
  }

  // 3. Process Issue Types & Fields
  const issueTypes = (proj.issuetypes ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    subtask: Boolean(t.subtask),
    description: t.description,
    iconUrl: t.iconUrl,
  }));

  const fieldsByIssueType: BulkCreateProjectMetadata["fieldsByIssueType"] = {};
  const priorityOptionsMap = new Map<string, { id: string; name: string }>();
  const versionOptionsMap = new Map<
    string,
    { id: string; name: string; archived?: boolean; released?: boolean }
  >();
  let pointsFieldId: string | null = env.jiraPointsFieldId || null;
  let epicLinkFieldId: string | null = null;
  let supportsTimeTracking = false;
  let supportsDueDate = false;

  for (const it of proj.issuetypes ?? []) {
    const fieldList: BulkCreateProjectMetadata["fieldsByIssueType"][string] = [];
    const fields = it.fields ?? {};

    for (const [fId, fDef] of Object.entries(fields) as [string, JiraCreateMetaField][]) {
      fieldList.push({
        id: fId,
        name: fDef.name,
        required: Boolean(fDef.required),
        schemaType: fDef.schema?.type,
        schemaItems: fDef.schema?.items,
        schemaCustom: fDef.schema?.custom,
        schemaSystem: fDef.schema?.system,
        allowedValues: fDef.allowedValues?.map((v) => ({
          id: String(v.id),
          name: v.name,
          value: v.value,
        })),
      });

      // Detect points field if not configured
      const lowerName = fDef.name.trim().toLowerCase();
      if (
        !pointsFieldId &&
        (lowerName === "story points" || lowerName === "task points") &&
        fDef.schema?.type === "number"
      ) {
        pointsFieldId = fId;
      }

      // Detect Epic Link field
      if (
        !epicLinkFieldId &&
        (lowerName === "epic link" ||
          lowerName === "epic" ||
          (fDef.schema as { custom?: string })?.custom === "com.pyxis.greenhopper.jira:gh-epic-link")
      ) {
        epicLinkFieldId = fId;
      }

      // Detect timetracking and duedate
      if (fId === "timetracking") supportsTimeTracking = true;
      if (fId === "duedate") supportsDueDate = true;

      // Collect priorities
      if (fId === "priority" && Array.isArray(fDef.allowedValues)) {
        for (const pv of fDef.allowedValues) {
          if (pv.id) {
            priorityOptionsMap.set(String(pv.id), {
              id: String(pv.id),
              name: pv.name || pv.value || String(pv.id),
            });
          }
        }
      }

      // Collect fix versions
      if (fId === "fixVersions" && Array.isArray(fDef.allowedValues)) {
        for (const fv of fDef.allowedValues) {
          if (fv.id) {
            versionOptionsMap.set(String(fv.id), {
              id: String(fv.id),
              name: fv.name || fv.value || String(fv.id),
              archived: Boolean(fv.archived),
              released: Boolean(fv.released),
            });
          }
        }
      }
    }

    fieldsByIssueType[it.id] = fieldList;
  }

  // Supplement version options from project versions API
  try {
    const versions = await jira.getVersions(normalizedKey);
    for (const v of versions) {
      if (v.id) {
        versionOptionsMap.set(String(v.id), {
          id: String(v.id),
          name: v.name || String(v.id),
          archived: Boolean(v.archived),
          released: Boolean(v.released),
        });
      }
    }
  } catch {
    // Non-fatal, use whatever fixVersions allowedValues had
  }

  // Time Tracking is often enabled but absent from the Create screen, so createmeta
  // alone under-reports it. Fall back to the instance-wide setting.
  if (!supportsTimeTracking) {
    try {
      const cfg = await jira.getConfiguration();
      if (cfg?.timeTrackingEnabled) supportsTimeTracking = true;
    } catch {
      // Non-fatal; keep createmeta-based detection
    }
  }

  // Fetch components from project components API
  let components: Array<{ id: string; name: string; description?: string }> = [];
  try {
    const rawComps = await jira.getProjectComponents(normalizedKey);
    components = (rawComps || []).map((c) => ({
      id: String(c.id),
      name: c.name,
      description: c.description,
    }));
  } catch {
    // Non-fatal if project has no components or API error
  }

  // Do NOT fallback to assumed priority IDs. If Jira metadata doesn't provide
  // allowed values, the field is unavailable and Jira's default will apply.
  const priorityOptions = Array.from(priorityOptionsMap.values());
  const versionOptions = Array.from(versionOptionsMap.values());

  const hasSubtaskTypes = issueTypes.some((t) => t.subtask);
  const defaultIssueTypeId: string | null =
    (proj as { defaultIssueTypeId?: string }).defaultIssueTypeId ?? issueTypes[0]?.id ?? null;
  const defaultSubtaskTypeId: string | null =
    issueTypes.find((t) => t.subtask)?.id ?? null;
  const allowsUnassigned = true;

  const fetchedAt = new Date().toISOString();
  const fingerprintRaw = JSON.stringify({
    projectKey: normalizedKey,
    issueTypes: issueTypes.map((t) => ({ id: t.id, name: t.name, subtask: t.subtask })),
    pointsFieldId,
    epicLinkFieldId,
    priorities: priorityOptions.map((p) => p.id),
    versions: versionOptions.map((v) => v.id),
    components: components.map((c) => c.id),
  });
  const fingerprint = `sha256:${sha256(fingerprintRaw)}`;

  const metaResult: BulkCreateProjectMetadata = {
    project: {
      key: proj.key,
      name: proj.name,
      id: proj.id,
    },
    canCreate,
    permissionReason,
    issueTypes,
    fieldsByIssueType,
    priorityOptions,
    versionOptions,
    components,
    pointsFieldId,
    epicLinkFieldId,
    supportsTimeTracking,
    supportsDueDate,
    hasSubtaskTypes,
    defaultIssueTypeId,
    defaultSubtaskTypeId,
    allowsUnassigned,
    fieldCapabilities: {
      priority: {
        available: priorityOptions.length > 0,
        reason: priorityOptions.length === 0 ? "Jira metadata không trả allowed values cho priority" : undefined,
      },
      fixVersions: {
        available: versionOptions.length > 0,
        reason: versionOptions.length === 0 ? "Dự án chưa có Fix Version" : undefined,
      },
      points: {
        available: pointsFieldId !== null,
        reason: pointsFieldId === null ? "Không tìm thấy trường Story Points" : undefined,
      },
      components: {
        available: components.length > 0,
        reason: components.length === 0 ? "Dự án chưa có Hợp phần (Components)" : undefined,
      },
    },
    fetchedAt,
    fingerprint,
  };

  const ttl = options?.ttlMs ?? METADATA_CACHE_TTL_MS;
  metadataCache.set(cacheKey, {
    meta: metaResult,
    expiresAt: Date.now() + ttl,
  });

  return metaResult;
}
