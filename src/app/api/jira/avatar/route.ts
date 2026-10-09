import { handleAvatarRequest } from "@/lib/jira/avatar-route-service";

export async function GET(req: Request) {
  return handleAvatarRequest(req);
}
