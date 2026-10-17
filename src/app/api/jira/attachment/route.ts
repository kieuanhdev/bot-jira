import { handleAttachmentRequest } from "@/lib/jira/attachment-route-service";

export async function GET(req: Request) {
  return handleAttachmentRequest(req);
}
