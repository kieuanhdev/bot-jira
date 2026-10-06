import type {
  BulkCreateRowInput,
  BulkCreateProjectMetadata,
} from "@/lib/bulk/create-types";

export interface ExcelImportResponse {
  items: BulkCreateRowInput[];
  manifest?: {
    schemaVersion: number;
    projectKey: string;
    projectName?: string;
    generatedAt: string;
    metadataFingerprint: string;
    maxItems: number;
  } | null;
  isStaleMetadata?: boolean;
  projectKeyMatch?: boolean;
  fileProjectKey?: string;
  stats?: {
    totalRows: number;
    validCount: number;
    errorCount: number;
    skippedEmptyCount: number;
    overflowCount: number;
  };
  errors?: Array<{ row: number; col?: string; message: string }>;
  warnings?: string[];
}

export interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (
    items: BulkCreateRowInput[],
    source: { type: "csv" | "paste" | "excel"; fileName?: string | null },
    mode: "replace" | "append"
  ) => void;
  existingFilledCount: number;
  projectKey?: string;
  metadata?: BulkCreateProjectMetadata;
}
