"use client";

import { BurndownChart } from "@/components/agile/burndown-chart";
import { CFDChart } from "@/components/agile/cfd-chart";
import { ReleaseComparisonChart } from "@/components/agile/release-comparison-chart";

interface AgileTabProps {
  projectKey: string;
  versionId?: string | null;
}

export function AgileTab({ projectKey, versionId }: AgileTabProps) {
  const selectedReleaseId = versionId && versionId !== "all" ? versionId : undefined;

  return (
    <div className="space-y-6">
      {/* Burndown Chart */}
      <BurndownChart projectKey={projectKey} releaseId={selectedReleaseId} />

      {/* Cumulative Flow Diagram (CFD) */}
      <CFDChart projectKey={projectKey} days={30} />

      {/* Release Comparisons */}
      <ReleaseComparisonChart projectKey={projectKey} />
    </div>
  );
}
