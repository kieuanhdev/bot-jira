import type { ChatCommand } from "../commands";
import type { ExecContext, CommandResult } from "../types";
import { handleHelpCommand } from "./help";
import { handleTaskCommand } from "./task";
import { handleWatchCommand, handleUnwatchCommand } from "./watch";
import { handleStaleCommand } from "./stale";
import { handleReleaseCommand } from "./release";
import { handleLinkCommand, handleUnlinkCommand } from "./link";
import { handleAssignCommand } from "./assign";
import { handleMoveCommand } from "./move";

export { handleHelpCommand } from "./help";
export { handleTaskCommand } from "./task";
export { handleWatchCommand, handleUnwatchCommand } from "./watch";
export { handleStaleCommand } from "./stale";
export { handleReleaseCommand } from "./release";
export { handleLinkCommand, handleUnlinkCommand } from "./link";
export { handleAssignCommand } from "./assign";
export { handleMoveCommand } from "./move";

/**
 * Dispatch normalized ChatCommand to its respective handler.
 */
export async function dispatchChatCommand(
  cmd: ChatCommand,
  ctx: ExecContext
): Promise<CommandResult> {
  switch (cmd.kind) {
    case "help":
      return handleHelpCommand();
    case "task":
      return handleTaskCommand(cmd, ctx);
    case "watch":
      return handleWatchCommand(cmd, ctx);
    case "unwatch":
      return handleUnwatchCommand(cmd, ctx);
    case "stale":
      return handleStaleCommand(cmd, ctx);
    case "release":
      return handleReleaseCommand(cmd, ctx);
    case "link":
      return handleLinkCommand(cmd, ctx);
    case "unlink":
      return handleUnlinkCommand(cmd, ctx);
    case "assign":
      return handleAssignCommand(cmd, ctx);
    case "move":
      return handleMoveCommand(cmd, ctx);
    case "confirm":
    case "unknown":
      throw new Error(`Command "${cmd.kind}" should be handled by executor top-level`);
    default: {
      const ex = cmd as { kind: string };
      return {
        status: "unrecognized",
        blocks: [{ kind: "text", text: `Unsupported command "${ex.kind}". Type /help.` }],
        text: `Unsupported command "${ex.kind}".`,
      };
    }
  }
}
