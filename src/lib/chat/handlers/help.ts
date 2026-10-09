import type { CommandResult } from "../types";

export function handleHelpCommand(): CommandResult {
  return {
    status: "help",
    blocks: [
      { kind: "text", text: "Available commands:" },
      {
        kind: "fields",
        fields: [
          { label: "/task PROJ-123", value: "Show task details", inline: false },
          { label: '/move PROJ-123 "In Progress"', value: "Transition task(s)", inline: false },
          { label: "/assign PROJ-123 me", value: "Assign task(s) to you", inline: false },
          { label: "/watch PROJ-123", value: "Watch a task for comments", inline: false },
          { label: "/unwatch PROJ-123", value: "Stop watching", inline: false },
          { label: "/release 1.4.2 check", value: "Run release gate check", inline: false },
          { label: "/stale", value: "List stale tasks", inline: false },
          { label: "/confirm", value: "Confirm a pending bulk action", inline: false },
        ],
      },
    ],
    text: "Commands: /task, /move, /assign, /watch, /unwatch, /release ... check, /stale, /confirm",
  };
}
