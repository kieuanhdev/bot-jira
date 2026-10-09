import type { JiraAuth } from "@/lib/jira/client";
import type { ChatBlock } from "./index";

export type CommandStatus =
  | "ok"
  | "preview"
  | "confirmed"
  | "rejected"
  | "error"
  | "blocked"
  | "unlinked"
  | "unrecognized"
  | "help"
  | "linked"
  | "info";

export type CommandResult = {
  /** Rendered chat blocks (or plain text fallback). */
  blocks: ChatBlock[];
  text: string;
  status: CommandStatus;
  /** Set when a confirmation was created and is waiting for the user. */
  confirmationId?: string;
  correlationId?: string;
};

export type ExecContext = {
  userId: string;
  jiraAuth: JiraAuth;
  jiraUsername: string | null;
  role: string;
  provider: string;
  externalAuthorId: string;
  externalMessageId?: string;
  channelId?: string;
};
