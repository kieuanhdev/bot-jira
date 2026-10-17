import { handleAttachmentListRequest } from "@/lib/jira/attachment-route-service";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  return handleAttachmentListRequest((await ctx.params).key ?? "");
}
