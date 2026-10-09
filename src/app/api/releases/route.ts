import {
  handleCreateReleaseRequest,
  handleReleaseListRequest,
} from "@/lib/releases/list-route-service";

export async function GET(req: Request) {
  return handleReleaseListRequest(req);
}

export async function POST(req: Request) {
  return handleCreateReleaseRequest(req);
}
