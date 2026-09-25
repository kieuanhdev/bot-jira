import { env } from "@/lib/env";
import type { JiraIssueLink } from "./types";

export type NormalizedIssueLink = {
  jiraLinkId: string;
  linkTypeId: string;
  linkTypeName: string;
  inwardLabel: string;
  outwardLabel: string;
  outwardKey: string;
  inwardKey: string;
};

/**
 * Checks whether a Jira link type corresponds to the configured dependency link
 * type (default "Blocks" / "is blocked by" / "blocks").
 */
export function isDependencyLinkType(
  linkType: { id?: string; name?: string; inward?: string; outward?: string },
  configuredType = env.jiraDependencyLinkType,
  configuredInward = env.jiraDependencyInwardLabel
): boolean {
  const name = (linkType.name ?? "").trim().toLowerCase();
  const inward = (linkType.inward ?? "").trim().toLowerCase();
  const outward = (linkType.outward ?? "").trim().toLowerCase();

  const targetName = configuredType.trim().toLowerCase();
  const targetInward = configuredInward.trim().toLowerCase();

  // Match by type name first, fallback to inward/outward labels
  if (name && targetName && name === targetName) {
    return true;
  }
  if (inward && targetInward && inward === targetInward) {
    return true;
  }
  if (outward === "blocks" && targetInward === "is blocked by") {
    return true;
  }
  return false;
}

/**
 * Normalizes a raw JiraIssueLink from the perspective of `currentKey` into
 * canonical `outwardKey blocks inwardKey` form.
 *
 * Semantic convention:
 * If Jira displays `A is blocked by B`:
 *   - A is the large task (inwardKey)
 *   - B is the dependency/sub-task (outwardKey)
 *   - Canonical link: B blocks A (outwardKey = B, inwardKey = A)
 */
export function normalizeIssueLink(
  currentKey: string,
  link: JiraIssueLink,
  options: {
    linkTypeName?: string;
    inwardLabel?: string;
  } = {}
): NormalizedIssueLink | null {
  if (!link.id || !link.type) return null;
  if (!isDependencyLinkType(link.type, options.linkTypeName, options.inwardLabel)) {
    return null;
  }

  const trimmedCurrent = currentKey.trim().toUpperCase();
  if (!trimmedCurrent) return null;

  const typeId = link.type.id ?? "";
  const typeName = link.type.name ?? "Blocks";
  const inwardLabel = link.type.inward ?? "is blocked by";
  const outwardLabel = link.type.outward ?? "blocks";

  // Case 1: link has inwardIssue
  // That means: currentKey [inwardLabel: "is blocked by"] inwardIssue.key
  // So inwardIssue.key blocks currentKey -> outwardKey: inwardIssue.key, inwardKey: currentKey
  if (link.inwardIssue?.key) {
    const inwardKey = trimmedCurrent;
    const outwardKey = link.inwardIssue.key.trim().toUpperCase();
    if (!outwardKey || outwardKey === inwardKey) return null; // Avoid self-links
    return {
      jiraLinkId: link.id,
      linkTypeId: typeId,
      linkTypeName: typeName,
      inwardLabel,
      outwardLabel,
      outwardKey,
      inwardKey,
    };
  }

  // Case 2: link has outwardIssue
  // That means: currentKey [outwardLabel: "blocks"] outwardIssue.key
  // So currentKey blocks outwardIssue.key -> outwardKey: currentKey, inwardKey: outwardIssue.key
  if (link.outwardIssue?.key) {
    const outwardKey = trimmedCurrent;
    const inwardKey = link.outwardIssue.key.trim().toUpperCase();
    if (!inwardKey || inwardKey === outwardKey) return null; // Avoid self-links
    return {
      jiraLinkId: link.id,
      linkTypeId: typeId,
      linkTypeName: typeName,
      inwardLabel,
      outwardLabel,
      outwardKey,
      inwardKey,
    };
  }

  return null;
}
