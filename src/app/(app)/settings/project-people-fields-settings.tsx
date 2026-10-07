"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Save } from "lucide-react";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Fields = { reporter: string; approver?: string | null; tester?: string | null };

export function ProjectPeopleFieldsSettings() {
  const qc = useQueryClient();
  const [project, setProject] = useState("");
  const [draftState, setDraftState] = useState<{ project: string; fields: Fields }>({ project: "", fields: { reporter: "reporter", approver: "", tester: "" } });
  const { data: projects } = useQuery({ queryKey: ["settings", "projects"], queryFn: () => api<{ items: Array<{ key: string; name: string }> }>("/api/projects") });
  const effectiveProject = project || projects?.items[0]?.key || "";
  const queryKey = ["projects", effectiveProject, "people-fields"];
  const { data, isLoading } = useQuery({
    queryKey,
    enabled: Boolean(effectiveProject),
    queryFn: () => api<{ fields: Fields }>(`/api/projects/${encodeURIComponent(effectiveProject)}/people-fields`),
  });
  const draft = draftState.project === effectiveProject ? draftState.fields : {
    reporter: data?.fields.reporter ?? "reporter", approver: data?.fields.approver ?? "", tester: data?.fields.tester ?? "",
  };
  const save = useMutation({
    mutationFn: () => api(`/api/projects/${encodeURIComponent(effectiveProject)}/people-fields`, { method: "PUT", body: { fields: draft } }),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  const detect = useMutation({
    mutationFn: () => api(`/api/projects/${encodeURIComponent(effectiveProject)}/people-fields`, { method: "POST", body: {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return (
    <Card>
      <CardHeader><CardTitle>Trường người theo dự án</CardTitle><CardDescription>Cấu hình Reporter, Approver và Assignee Tester; giá trị thủ công không bị tác vụ dò hằng ngày ghi đè.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <Select value={effectiveProject} onValueChange={setProject}><SelectTrigger className="w-full sm:w-72"><SelectValue placeholder="Chọn dự án" /></SelectTrigger><SelectContent>{projects?.items.map((item) => <SelectItem key={item.key} value={item.key}>{item.name} ({item.key})</SelectItem>)}</SelectContent></Select>
        <div className="grid gap-3 sm:grid-cols-3">
          {(["reporter", "approver", "tester"] as const).map((role) => <label key={role} className="space-y-1 text-sm"><span className="font-medium capitalize">{role}</span><Input disabled={isLoading} value={draft[role] ?? ""} placeholder={role === "reporter" ? "reporter" : "customfield_..."} onChange={(event) => setDraftState({ project: effectiveProject, fields: { ...draft, [role]: event.target.value } })} /></label>)}
        </div>
        <div className="flex gap-2"><Button onClick={() => save.mutate()} disabled={!effectiveProject || save.isPending}><Save className="h-4 w-4" aria-hidden />Lưu ghi đè</Button><Button variant="outline" onClick={() => detect.mutate()} disabled={!effectiveProject || detect.isPending}><RefreshCw className={`h-4 w-4 ${detect.isPending ? "animate-spin" : ""}`} aria-hidden />Dò lại</Button></div>
      </CardContent>
    </Card>
  );
}
