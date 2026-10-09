import {
  handleIssueDetailRequest,
  handleIssueUpdateRequest,
} from "@/lib/issues/detail-route-service";

type IssueRouteContext = { params: Promise<{ key: string }> };

export async function GET(req: Request, ctx: IssueRouteContext) {
  return handleIssueDetailRequest(req, ctx);
}

export async function PATCH(req: Request, ctx: IssueRouteContext) {
  return handleIssueUpdateRequest(req, ctx);
}
