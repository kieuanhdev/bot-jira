import { NextResponse } from "next/server";
import { getSession, isAdmin } from "@/lib/session";
import { isValidProjectKeyFormat, normalizeProjectKey } from "@/lib/jira/project-catalog";
import { toggleProjectSync, updateProjectSyncFeatures } from "@/lib/admin/project-sync";
import {
  presetToFeatures,
  validateSyncFeatures,
  PRESET_DEFINITIONS,
  type SyncPreset,
  type SyncFeature,
} from "@/lib/jira/sync-features";

/** Admin-only: turn one project's Jira sync on/off or update granular features. */
export async function PATCH(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const projectKey = normalizeProjectKey((await ctx.params).key);
  if (!isValidProjectKeyFormat(projectKey)) {
    return NextResponse.json({ error: "invalid_project_key" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    syncEnabled?: unknown;
    features?: unknown;
    preset?: unknown;
  };

  const hasSyncEnabled = typeof body.syncEnabled === "boolean";
  const hasFeatures = body.features !== undefined;
  const hasPreset = body.preset !== undefined;

  if (!hasSyncEnabled && !hasFeatures && !hasPreset) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const actor = {
    id: session.user.id,
    email: session.user.email,
  };

  let featureUpdates: Partial<Record<SyncFeature, boolean>> | null = null;

  if (hasPreset) {
    const validPresets = Object.keys(PRESET_DEFINITIONS) as Array<Exclude<SyncPreset, "custom">>;
    const presetCandidate = typeof body.preset === "string" ? body.preset : "";
    if (!(validPresets as string[]).includes(presetCandidate)) {
      return NextResponse.json(
        { error: `Preset không hợp lệ: "${body.preset}". Hợp lệ: ${validPresets.join(", ")}` },
        { status: 400 }
      );
    }
    featureUpdates = presetToFeatures(presetCandidate as Exclude<SyncPreset, "custom">);
  }

  if (hasFeatures) {
    const validation = validateSyncFeatures(body.features);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    featureUpdates = {
      ...(featureUpdates ?? {}),
      ...validation.features,
    };
  }

  let syncResult: { key: string; syncEnabled: boolean; syncJobId: string | null } | null = null;
  if (hasSyncEnabled) {
    syncResult = await toggleProjectSync(projectKey, body.syncEnabled as boolean, actor);
    if (!syncResult) return NextResponse.json({ error: "project_not_found" }, { status: 404 });
  }

  let featureResult: {
    key: string;
    syncEnabled: boolean;
    features: Record<SyncFeature, boolean>;
    preset: SyncPreset;
    backfillJobId: string | null;
  } | null = null;

  if (featureUpdates) {
    featureResult = await updateProjectSyncFeatures(projectKey, featureUpdates, actor);
    if (!featureResult) return NextResponse.json({ error: "project_not_found" }, { status: 404 });
  }

  return NextResponse.json({
    key: projectKey,
    ...(syncResult ?? {}),
    ...(featureResult ?? {}),
  });
}
