import { handleCredentialsUpdateRequest } from "@/lib/credentials/route-service";

export { verifyCreds } from "@/lib/credentials/route-service";

export async function PUT(req: Request) {
  return handleCredentialsUpdateRequest(req);
}
