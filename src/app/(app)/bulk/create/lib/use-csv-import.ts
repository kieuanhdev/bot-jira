"use client";

import { useReducer } from "react";
import type { ParsedCsvResult } from "@/lib/bulk/csv-parser";
import type { ExcelImportResponse } from "./csv-import-types";

export type CsvImportTab = "file" | "paste" | "guide";
export type ImportMode = "replace" | "append";

export interface CsvImportState {
  activeTab: CsvImportTab;
  rawText: string;
  fileName: string | null;
  parsed: ParsedCsvResult | null;
  excelResult: ExcelImportResponse | null;
  isProcessing: boolean;
  fileError: string | null;
  isDragging: boolean;
  importMode: ImportMode;
  confirmTruncation: boolean;
  downloadingExcel: boolean;
}

export type CsvImportAction =
  | { type: "SET_TAB"; tab: CsvImportTab }
  | { type: "SET_DRAGGING"; isDragging: boolean }
  | { type: "SET_IMPORT_MODE"; mode: ImportMode }
  | { type: "SET_CONFIRM_TRUNCATION"; confirm: boolean }
  | { type: "SET_DOWNLOADING_EXCEL"; downloading: boolean }
  | { type: "START_PROCESSING_FILE"; fileName: string }
  | { type: "SET_FILE_ERROR"; error: string | null }
  | { type: "SET_EXCEL_RESULT"; result: ExcelImportResponse }
  | { type: "SET_PARSED_CSV"; result: ParsedCsvResult }
  | { type: "SET_PASTE_TEXT"; text: string; parsed: ParsedCsvResult | null }
  | { type: "RESET"; defaultMode?: ImportMode };

export function createInitialCsvImportState(existingFilledCount = 0): CsvImportState {
  return {
    activeTab: "file",
    rawText: "",
    fileName: null,
    parsed: null,
    excelResult: null,
    isProcessing: false,
    fileError: null,
    isDragging: false,
    importMode: existingFilledCount > 0 ? "append" : "replace",
    confirmTruncation: false,
    downloadingExcel: false,
  };
}

export function csvImportReducer(
  state: CsvImportState,
  action: CsvImportAction
): CsvImportState {
  switch (action.type) {
    case "SET_TAB":
      return { ...state, activeTab: action.tab };
    case "SET_DRAGGING":
      return { ...state, isDragging: action.isDragging };
    case "SET_IMPORT_MODE":
      return { ...state, importMode: action.mode };
    case "SET_CONFIRM_TRUNCATION":
      return { ...state, confirmTruncation: action.confirm };
    case "SET_DOWNLOADING_EXCEL":
      return { ...state, downloadingExcel: action.downloading };
    case "START_PROCESSING_FILE":
      return {
        ...state,
        fileError: null,
        fileName: action.fileName,
        parsed: null,
        excelResult: null,
      };
    case "SET_FILE_ERROR":
      return {
        ...state,
        fileError: action.error,
        isProcessing: false,
      };
    case "SET_EXCEL_RESULT":
      return {
        ...state,
        excelResult: action.result,
        isProcessing: false,
        fileError: null,
      };
    case "SET_PARSED_CSV":
      return {
        ...state,
        parsed: action.result,
        isProcessing: false,
        fileError: null,
      };
    case "SET_PASTE_TEXT":
      return {
        ...state,
        rawText: action.text,
        parsed: action.parsed,
        excelResult: null,
        fileError: null,
      };
    case "RESET":
      return {
        ...createInitialCsvImportState(),
        importMode: action.defaultMode ?? state.importMode,
      };
    default:
      return state;
  }
}

export function useCsvImport(existingFilledCount = 0) {
  const [state, dispatch] = useReducer(
    csvImportReducer,
    existingFilledCount,
    createInitialCsvImportState
  );

  return [state, dispatch] as const;
}
