import { ListChecks } from "lucide-react";

export { BulkOperationModeSwitch } from "./bulk-operation-mode-switch";
export { BulkWorklogForm } from "./bulk-worklog-form";
export { BulkTransitionForm } from "./bulk-transition-form";
export { BulkFieldPicker } from "./bulk-field-picker";
export {
  BulkFieldInputs,
  PEOPLE_ROLE_LABELS,
  type BulkFieldValuesState,
  type BulkFieldSetters,
} from "./bulk-field-inputs";

export function BulkConfigureEmptyState() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed p-6 text-muted-foreground">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
        <ListChecks className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      </span>
      <div>
        <p className="text-sm font-medium text-foreground">Chưa có dự án nào được chọn</p>
        <p className="text-xs text-muted-foreground">Chọn dự án ở Bước 1 để tải cấu hình các trường có thể chỉnh sửa.</p>
      </div>
    </div>
  );
}
