import { describe, it, expect } from "vitest";
import {
  csvImportReducer,
  createInitialCsvImportState,
  type CsvImportState,
} from "./use-csv-import";

describe("use-csv-import reducer", () => {
  it("initializes default state based on existingFilledCount", () => {
    const stateEmpty = createInitialCsvImportState(0);
    expect(stateEmpty.importMode).toBe("replace");
    expect(stateEmpty.activeTab).toBe("file");
    expect(stateEmpty.rawText).toBe("");

    const stateFilled = createInitialCsvImportState(5);
    expect(stateFilled.importMode).toBe("append");
  });

  it("handles tab switching and drag state", () => {
    const initial = createInitialCsvImportState();
    const tabState = csvImportReducer(initial, { type: "SET_TAB", tab: "paste" });
    expect(tabState.activeTab).toBe("paste");

    const dragState = csvImportReducer(tabState, { type: "SET_DRAGGING", isDragging: true });
    expect(dragState.isDragging).toBe(true);
  });

  it("handles file start, error, and parsing results", () => {
    let state = createInitialCsvImportState();

    state = csvImportReducer(state, {
      type: "START_PROCESSING_FILE",
      fileName: "tasks.csv",
    });
    expect(state.fileName).toBe("tasks.csv");
    expect(state.fileError).toBeNull();

    state = csvImportReducer(state, {
      type: "SET_FILE_ERROR",
      error: "File too big",
    });
    expect(state.fileError).toBe("File too big");
    expect(state.isProcessing).toBe(false);

    const mockParsed = {
      items: [{ summary: "Task 1", clientRef: "r1" }],
      errors: [],
      warnings: [],
      totalRows: 1,
      validRows: 1,
    } as unknown as import("@/lib/bulk/csv-parser").ParsedCsvResult;
    state = csvImportReducer(state, {
      type: "SET_PARSED_CSV",
      result: mockParsed,
    });
    expect(state.parsed).toBe(mockParsed);
    expect(state.fileError).toBeNull();
  });

  it("handles excel result and paste text updates", () => {
    let state = createInitialCsvImportState();

    const mockExcel = {
      projectKey: "PROJ",
      items: [{ summary: "Excel Task", clientRef: "e1" }],
      errors: [],
      warnings: [],
      total: 1,
      valid: 1,
    };
    state = csvImportReducer(state, {
      type: "SET_EXCEL_RESULT",
      result: mockExcel,
    });
    expect(state.excelResult).toBe(mockExcel);

    state = csvImportReducer(state, {
      type: "SET_PASTE_TEXT",
      text: "summary\nTask 2",
      parsed: null,
    });
    expect(state.rawText).toBe("summary\nTask 2");
    expect(state.excelResult).toBeNull();
  });

  it("handles reset action", () => {
    let state: CsvImportState = {
      ...createInitialCsvImportState(),
      rawText: "some text",
      fileName: "test.csv",
      confirmTruncation: true,
    };

    state = csvImportReducer(state, { type: "RESET", defaultMode: "append" });
    expect(state.rawText).toBe("");
    expect(state.fileName).toBeNull();
    expect(state.confirmTruncation).toBe(false);
    expect(state.importMode).toBe("append");
  });
});
