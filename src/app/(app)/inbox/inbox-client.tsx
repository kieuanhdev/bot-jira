"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, SendHorizonal, Inbox } from "lucide-react";

type Entry = {
  id: number;
  command: string;
  time: string;
  ok: boolean;
  results?: { key: string; ok: boolean; error?: string; transitionedTo?: string }[];
  reason?: string;
};

const EXAMPLES = [
  "MOVE PROJ-123 TO In Progress",
  "DONE PROJ-124",
  "CLOSE PROJ-125",
  "MOVE PROJ-1, PROJ-2 TO Done",
];

export function InboxClient() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<Entry[]>([]);
  const counter = useRef(0);


  async function send() {
    const cmd = text.trim();
    if (!cmd) return;
    setBusy(true);
    try {
      const r = await api<{
        ok: boolean;
        reason?: string;
        results?: { key: string; ok: boolean; error?: string; transitionedTo?: string }[];
      }>("/api/inbox/command", { method: "POST", body: { text: cmd } });
      counter.current += 1;
      setLog((prev) => [
        {
          id: counter.current,
          command: cmd,
          time: new Date().toISOString(),
          ok: r.ok && (r.results ?? []).every((x) => x.ok),
          results: r.results,
          reason: r.reason,
        },
        ...prev,
      ]);
      if (r.ok) setText("");
    } catch (e) {
      counter.current += 1;
      setLog((prev) => [
        { id: counter.current, command: cmd, time: new Date().toISOString(), ok: false, reason: (e as Error).message },
        ...prev,
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Hộp thư lệnh</h1>
        <p className="text-sm text-muted-foreground">
          Dán lệnh từ chat (hoặc gõ trực tiếp) để chuyển trạng thái task. Ví dụ:
          <code className="mx-1 rounded bg-muted px-1 text-xs">MOVE PROJ-123 TO In Progress</code>
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send();
            }}
            placeholder="MOVE PROJ-123 TO In Progress"
            rows={2}
            className="resize-none"
          />
          <div className="mt-3 flex items-center justify-between">
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setText(ex)}
                  className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent"
                >
                  {ex}
                </button>
              ))}
            </div>
            <Button onClick={send} disabled={busy} className="gap-1.5">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
              Gửi
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lịch sử lệnh</CardTitle>
          <CardDescription>Lệnh gần nhất hiển thị trước.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {log.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Inbox className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">Chưa có lệnh nào được gửi.</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Gõ lệnh ở trên và nhấn <kbd className="rounded bg-muted px-1">⌘/Ctrl + Enter</kbd> để thực thi.
              </p>
            </div>
          )}
          {log.map((entry) => (
            <div key={entry.id} className="rounded-md border p-3">
              <div className="flex items-center justify-between">
                <code className="text-xs">{entry.command}</code>
                <Badge variant={entry.ok ? "success" : "danger"}>{entry.ok ? "thành công" : "thất bại"}</Badge>
              </div>
              {entry.reason && <p className="mt-1 text-xs text-muted-foreground">{entry.reason}</p>}
              {entry.results && (
                <ul className="mt-2 space-y-0.5">
                  {entry.results.map((r, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs">
                      <Badge variant={r.ok ? "success" : "danger"} className="h-4 px-1.5 text-[10px]">
                        {r.ok ? "thành công" : "lỗi"}
                      </Badge>
                      <span className="font-mono">{r.key}</span>
                      {r.transitionedTo && <span className="text-muted-foreground">→ {r.transitionedTo}</span>}
                      {r.error && <span className="text-muted-foreground">{r.error}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
