import { handleIssueListRequest } from "@/lib/issues/list-route-service";

export async function GET(req: Request) {
  return handleIssueListRequest(req);
}
