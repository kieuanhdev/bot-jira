"use client";

import { useMemo, useState } from "react";
import type { PeopleFieldData } from "./use-board-filter-options";

export function useBoardTableColumns(peopleFieldData?: PeopleFieldData | null) {
  const [hiddenTableCols, setHiddenTableCols] = useState<Set<string>>(() => new Set());

  const effectiveHiddenTableCols = useMemo(() => {
    const next = new Set(hiddenTableCols);
    if (peopleFieldData && !peopleFieldData.fields.approver) next.add("approver");
    if (peopleFieldData && !peopleFieldData.fields.tester) next.add("tester");
    return next;
  }, [hiddenTableCols, peopleFieldData]);

  function toggleTableColumn(colKey: string) {
    setHiddenTableCols((prev) => {
      const next = new Set(prev);
      if (next.has(colKey)) next.delete(colKey);
      else next.add(colKey);
      return next;
    });
  }

  function resetTableColumns() {
    setHiddenTableCols(new Set());
  }

  return {
    hiddenTableCols,
    effectiveHiddenTableCols,
    toggleTableColumn,
    resetTableColumns,
  };
}
