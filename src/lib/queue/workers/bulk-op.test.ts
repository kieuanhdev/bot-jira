import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bulkOperationFindUnique: vi.fn(),
  executeBulkCreateOperation: vi.fn(),
  executeBulkOperation: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    bulkOperation: {
      findUnique: mocks.bulkOperationFindUnique,
    },
  },
}));

vi.mock("@/lib/bulk/create-ops", () => ({
  executeBulkCreateOperation: mocks.executeBulkCreateOperation,
}));

vi.mock("@/lib/bulk/ops", () => ({
  executeBulkOperation: mocks.executeBulkOperation,
}));

import { runBulkOperation } from "./bulk-op";

describe("runBulkOperation worker entrypoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing if operationId is empty or falsy", async () => {
    await runBulkOperation("");
    expect(mocks.bulkOperationFindUnique).not.toHaveBeenCalled();
    expect(mocks.executeBulkCreateOperation).not.toHaveBeenCalled();
    expect(mocks.executeBulkOperation).not.toHaveBeenCalled();
  });

  it("does nothing if operation is not found in database", async () => {
    mocks.bulkOperationFindUnique.mockResolvedValue(null);

    await runBulkOperation("non-existent-op");

    expect(mocks.bulkOperationFindUnique).toHaveBeenCalledWith({
      where: { id: "non-existent-op" },
      select: { type: true },
    });
    expect(mocks.executeBulkCreateOperation).not.toHaveBeenCalled();
    expect(mocks.executeBulkOperation).not.toHaveBeenCalled();
  });

  it("routes create-issues operation to executeBulkCreateOperation", async () => {
    mocks.bulkOperationFindUnique.mockResolvedValue({
      type: "create-issues",
    });

    await runBulkOperation("op-create-1");

    expect(mocks.executeBulkCreateOperation).toHaveBeenCalledWith("op-create-1");
    expect(mocks.executeBulkOperation).not.toHaveBeenCalled();
  });

  it("routes other bulk operation types to executeBulkOperation", async () => {
    mocks.bulkOperationFindUnique.mockResolvedValue({
      type: "update-fields",
    });

    await runBulkOperation("op-update-1");

    expect(mocks.executeBulkOperation).toHaveBeenCalledWith("op-update-1");
    expect(mocks.executeBulkCreateOperation).not.toHaveBeenCalled();
  });
});
