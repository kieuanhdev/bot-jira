import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/api/json-body";
import { AdminProjectSyncBodySchema } from "@/lib/api/schemas";
import { getSession, isAdmin } from "@/lib/session";
import {
  listAdminProjectSync,
  toggleAllProjectSync,
  bulkUpdateProjectSyncFeatures,
} from "@/lib/admin/project-sync";
import {
  presetToFeatures,
  validateSyncFeatures,
  PRESET_DEFINITIONS,
  type SyncPreset,
  type SyncFeature,
} from "@/lib/jira/sync-features";

export const dynamic = "force-dynamic";

/** Admin-only: every active project with its sync switch and last sync outcome. */
export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  return NextResponse.json({ items: await listAdminProjectSync(), generatedAt: new Date().toISOString() });
}

/** Admin-only: turn sync on or off for every active project, or bulk apply presets/features. */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsedBody = await readJsonBody(req, AdminProjectSyncBodySchema);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;

  const actor = {
    id: session.user.id,
    email: session.user.email,
  };

  // Bulk update features / preset for specific keys
  if (Array.isArray(body.keys)) {
    if (body.keys.length === 0) {
      return NextResponse.json({ error: "keys_empty" }, { status: 400 });
    }
    const keys = body.keys.filter((k): k is string => typeof k === "string" && Boolean(k.trim()));
    let featureUpdates: Partial<Record<SyncFeature, boolean>> | null = null;

    if (body.preset !== undefined) {
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

    if (body.features !== undefined) {
      const validation = validateSyncFeatures(body.features);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
      featureUpdates = {
        ...(featureUpdates ?? {}),
        ...validation.features,
      };
    }

    if (!featureUpdates) {
      return NextResponse.json({ error: "missing_preset_or_features" }, { status: 400 });
    }

    const result = await bulkUpdateProjectSyncFeatures(keys, featureUpdates, actor);
    return NextResponse.json(result);
  }

  // Toggle all projects syncEnabled switch
  if (typeof body.syncEnabled === "boolean") {
    const result = await toggleAllProjectSync(body.syncEnabled, actor);
    return NextResponse.json({ syncEnabled: body.syncEnabled, ...result });
  }

  return NextResponse.json({ error: "invalid_body" }, { status: 400 });
}
