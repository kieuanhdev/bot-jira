import { handleCreateWorklogRequest } from "@/lib/worklogs/route-service";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ key: string }> }
) {
  return handleCreateWorklogRequest(req, ctx);
}
