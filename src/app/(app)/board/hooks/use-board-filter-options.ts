"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { issuesKeys } from "@/lib/query-keys";
import type { BoardBootstrap } from "@/lib/board/bootstrap";
import type { ListOptions } from "../board-list-view";

export interface FilterOptionsData {
  assignees: string[];
  labels: string[];
  priorities: string[];
  statuses: string[];
  epics: string[];
  types: string[];
  fixVersions: string[];
  reporters: string[];
  approvers: string[];
  testers: string[];
  displayNames: Record<string, string>;
}

export interface PeopleFieldData {
  fields: {
    reporter: string;
    approver?: string | null;
    tester?: string | null;
  };
}

export function useBoardFilterOptions(
  selectedProject: string,
  initialBootstrap?: BoardBootstrap
) {
  // Query runs in parallel with issues eliminating the waterfall (no enabled: Boolean(issueData))
  const { data: optData } = useQuery({
    queryKey: issuesKeys.filters(selectedProject),
    enabled: Boolean(selectedProject),
    queryFn: () =>
      api<FilterOptionsData>(`/api/issues/filters?project=${selectedProject}`),
    staleTime: 5 * 60_000,
    retry: 0,
  });

  const assignees = useMemo(() => optData?.assignees ?? [], [optData?.assignees]);

  const listOptions = useMemo<ListOptions>(() => {
    const everyone = [
      ...new Set([
        ...(optData?.assignees ?? []),
        ...(optData?.reporters ?? []),
        ...(optData?.approvers ?? []),
        ...(optData?.testers ?? []),
      ]),
    ].sort((a, b) => a.localeCompare(b));
    return {
      statuses: optData?.statuses ?? [],
      assignees: everyone,
      types: optData?.types ?? [],
      epics: optData?.epics ?? [],
      reporters: everyone,
      approvers: everyone,
      testers: everyone,
    };
  }, [optData]);

  const filterBarOptions = useMemo(() => {
    const personOpts = (values: string[] | undefined) =>
      (values ?? []).map((value) => ({
        value,
        label: optData?.displayNames?.[value]
          ? `${optData.displayNames[value]} (${value})`
          : value,
      }));
    return {
      assignees: personOpts(optData?.assignees),
      labels: optData?.labels ?? [],
      priorities: optData?.priorities ?? ["Low", "Medium", "High", "Highest", "Blocker"],
      statuses: optData?.statuses ?? [],
      epics: optData?.epics ?? [],
      types: optData?.types ?? [],
      fixVersions: optData?.fixVersions ?? [],
      reporters: personOpts(optData?.reporters),
      approvers: personOpts(optData?.approvers),
      testers: personOpts(optData?.testers),
    };
  }, [optData]);

  const { data: peopleFieldData } = useQuery({
    queryKey: ["projects", selectedProject, "people-fields"],
    enabled: Boolean(selectedProject),
    queryFn: () =>
      api<PeopleFieldData>(
        `/api/projects/${encodeURIComponent(selectedProject)}/people-fields`
      ),
    initialData:
      initialBootstrap && initialBootstrap.initialProject === selectedProject
        ? (initialBootstrap.peopleFieldData ?? undefined)
        : undefined,
    staleTime: 5 * 60_000,
  });

  return {
    optData,
    assignees,
    listOptions,
    filterBarOptions,
    peopleFieldData,
  };
}
