import { EmptyState } from "@/components/shared/empty-state";
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
    <EmptyState
      size="compact"
      icon={ListChecks}
      title="Chưa có dự án nào được chọn"
      description="Chọn dự án ở Bước 1 để tải cấu hình các trường có thể chỉnh sửa."
      className="p-6"
    />
  );
}
