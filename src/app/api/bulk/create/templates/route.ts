import { handleBulkTemplateRequest } from "@/lib/bulk/template-route-service";

export type {
  BulkCreateTemplateIssueItem,
  BulkCreateTemplateRow,
} from "@/lib/contracts/bulk-create-template";

export async function GET(req: Request) {
  return handleBulkTemplateRequest(req);
}
