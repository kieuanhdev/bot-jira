import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getSystemJiraAuth, jiraWith } from "@/lib/jira/client";
import { userJiraAuth } from "@/lib/user-creds";
import { jiraCredentialsRequired } from "@/lib/jira/credentials-required";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ key: string }> }
) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { key } = await ctx.params;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true },
  });
  const auth = userJiraAuth(user) || (await getSystemJiraAuth());
  if (!auth) {
    return NextResponse.json({ transitions: [] });
  }
  const client = jiraWith(auth);

  try {
    const transitions = await client.getTransitions(key);
    return NextResponse.json({ transitions });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
