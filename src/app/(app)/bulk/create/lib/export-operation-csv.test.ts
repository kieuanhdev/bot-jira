import { describe, it, expect, vi } from "vitest";
import {
  generateOperationCsv,
  exportOperationCsv,
  type OperationExportItem,
} from "./export-operation-csv";

describe("export-operation-csv", () => {
  it("generates correct CSV headers and BOM for empty items list", () => {
    const csv = generateOperationCsv([]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toBe('\uFEFFSTT,Client Ref,Jira Key,Summary,Trạng thái,Lỗi / Chi tiết');
  });

  it("formats items with translated status and escapes double quotes", () => {
    const items: OperationExportItem[] = [
      {
        rowIndex: 0,
        clientRef: "ref-1",
        jiraKey: "PROJ-101",
        status: "succeeded",
        requested: { summary: 'Task "A" with quotes' },
        error: null,
      },
      {
        rowIndex: 1,
        clientRef: "ref-2",
        jiraKey: null,
        status: "failed",
        requested: { summary: "Task B" },
        error: 'Failed with "timeout"',
      },
      {
        rowIndex: 2,
        clientRef: "ref-3",
        jiraKey: null,
        status: "blocked_by_parent",
        requested: { summary: "Subtask C" },
        error: "Parent ref-2 failed",
      },
      {
        rowIndex: 3,
        clientRef: "ref-4",
        jiraKey: null,
        status: "custom_status",
        requested: { summary: "Other" },
        error: null,
      },
    ];

    const csv = generateOperationCsv(items);
    const lines = csv.split("\r\n");

    expect(lines[0]).toBe('\uFEFFSTT,Client Ref,Jira Key,Summary,Trạng thái,Lỗi / Chi tiết');
    expect(lines[1]).toBe('"1","ref-1","PROJ-101","Task ""A"" with quotes","Thành công",""');
    expect(lines[2]).toBe('"2","ref-2","","Task B","Thất bại","Failed with ""timeout"""');
    expect(lines[3]).toBe('"3","ref-3","","Subtask C","Chờ task cha","Parent ref-2 failed"');
    expect(lines[4]).toBe('"4","ref-4","","Other","custom_status",""');
  });

  it("handles fallback to array index when rowIndex is undefined", () => {
    const items: OperationExportItem[] = [
      {
        clientRef: "ref-x",
        status: "succeeded",
        requested: { summary: "No index" },
      },
    ];

    const csv = generateOperationCsv(items);
    const lines = csv.split("\r\n");
    expect(lines[1].startsWith('"1",')).toBe(true);
  });

  it("exportOperationCsv triggers DOM download when in browser environment", () => {
    const mockClick = vi.fn();
    const mockAppendChild = vi.fn();
    const mockRemoveChild = vi.fn();

    const mockAnchor = {
      click: mockClick,
      download: "",
      href: "",
    };

    const globalScope = globalThis as unknown as { document: unknown };
    const originalDocument = globalScope.document;
    globalScope.document = {
      createElement: vi.fn((tag: string) => (tag === "a" ? mockAnchor : {})),
      body: {
        appendChild: mockAppendChild,
        removeChild: mockRemoveChild,
      },
    };

    const mockCreateObjectURL = vi.fn(() => "blob:test");
    const mockRevokeObjectURL = vi.fn();
    global.URL.createObjectURL = mockCreateObjectURL;
    global.URL.revokeObjectURL = mockRevokeObjectURL;

    try {
      exportOperationCsv(
        [
          {
            rowIndex: 0,
            clientRef: "c1",
            status: "succeeded",
            jiraKey: "KAN-1",
          },
        ],
        { projectKey: "KAN", operationId: "op-12345678" }
      );

      expect(mockClick).toHaveBeenCalledTimes(1);
      expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
      expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:test");
      expect(mockAnchor.download).toBe("bulk-create-KAN-345678.csv");
    } finally {
      if (originalDocument) {
        globalScope.document = originalDocument;
      } else {
        delete (globalScope as { document?: unknown }).document;
      }
      vi.restoreAllMocks();
    }
  });

  it("exportOperationCsv does nothing when items array is empty", () => {
    const mockCreateObjectURL = vi.fn();
    global.URL.createObjectURL = mockCreateObjectURL;

    exportOperationCsv([]);

    expect(mockCreateObjectURL).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
