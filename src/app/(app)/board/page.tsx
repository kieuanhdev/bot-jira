import { getSession } from "@/lib/session";
import { getBoardBootstrap } from "@/lib/board/bootstrap";
import { BoardClient } from "./board-client";

export const metadata = { title: "Board" };

export default async function BoardPage(props: {
  searchParams?: Promise<{ project?: string }>;
}) {
  const session = await getSession();
  const searchParams = props.searchParams ? await props.searchParams : undefined;
  const initialProjectFromUrl = searchParams?.project?.trim().toUpperCase();
  const bootstrap = session?.user?.id
    ? await getBoardBootstrap(session.user.id, initialProjectFromUrl)
    : null;

  return <BoardClient initialBootstrap={bootstrap} />;
}
