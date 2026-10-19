import { Activity, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OperationDetail } from "./bulk-operation-detail";

export function BulkRunCard({
  id,
  jiraBaseUrl,
  onClose,
}: {
  id: string;
  jiraBaseUrl: string;
  onClose: () => void;
}) {
  return (
    <Card id="bulk-run-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
          Tiến độ thực thi
        </CardTitle>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-8 cursor-pointer px-2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          <span className="text-xs">Đóng</span>
        </Button>
      </CardHeader>
      <CardContent>
        <OperationDetail id={id} jiraBaseUrl={jiraBaseUrl} />
      </CardContent>
    </Card>
  );
}
