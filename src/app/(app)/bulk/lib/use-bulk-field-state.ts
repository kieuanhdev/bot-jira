"use client";

import { useState } from "react";

export type PeopleRole = "reporter" | "approver" | "tester";
export type PersonFieldState = { value: string; clear: boolean };
export type PeopleState = Record<PeopleRole, PersonFieldState>;

const EMPTY_PEOPLE: PeopleState = {
  reporter: { value: "", clear: false },
  approver: { value: "", clear: false },
  tester: { value: "", clear: false },
};

export function useBulkFieldState() {
  const [assignee, setAssignee] = useState("");
  const [clearAssignee, setClearAssignee] = useState(false);
  const [label, setLabel] = useState("");
  const [clearLabels, setClearLabels] = useState(false);
  const [priority, setPriority] = useState("");
  const [issueType, setIssueType] = useState("");
  const [points, setPoints] = useState("");
  const [clearPoints, setClearPoints] = useState(false);
  const [estimate, setEstimate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [clearDueDate, setClearDueDate] = useState(false);
  const [fixVersions, setFixVersions] = useState<string[]>([]);
  const [clearFixVersions, setClearFixVersions] = useState(false);
  const [epic, setEpic] = useState("");
  const [clearEpic, setClearEpic] = useState(false);
  const [people, setPeople] = useState<PeopleState>(EMPTY_PEOPLE);
  const setPerson = (role: PeopleRole, patch: Partial<PersonFieldState>) =>
    setPeople((prev) => ({ ...prev, [role]: { ...prev[role], ...patch } }));

  function resetFields() {
    setAssignee("");
    setClearAssignee(false);
    setLabel("");
    setClearLabels(false);
    setPriority("");
    setIssueType("");
    setPoints("");
    setClearPoints(false);
    setEstimate("");
    setDueDate("");
    setClearDueDate(false);
    setFixVersions([]);
    setClearFixVersions(false);
    setEpic("");
    setClearEpic(false);
    setPeople(EMPTY_PEOPLE);
  }

  const values = {
    assignee,
    clearAssignee,
    label,
    clearLabels,
    priority,
    issueType,
    points,
    clearPoints,
    estimate,
    dueDate,
    clearDueDate,
    fixVersions,
    clearFixVersions,
    epic,
    clearEpic,
    people,
  };

  const setters = {
    setAssignee,
    setClearAssignee,
    setLabel,
    setClearLabels,
    setPriority,
    setIssueType,
    setPoints,
    setClearPoints,
    setEstimate,
    setDueDate,
    setClearDueDate,
    setFixVersions,
    setClearFixVersions,
    setEpic,
    setClearEpic,
    setPerson,
  };

  return {
    values,
    setters,
    resetFields,
  };
}
