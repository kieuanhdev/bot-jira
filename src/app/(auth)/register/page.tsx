import type { Metadata } from "next";
import { Bot } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RegisterClient } from "./register-client";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Bot className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl">Create your account</CardTitle>
          <CardDescription>
            Join the team task board. After signing in you can link your own Jira
            &amp; Bitbucket account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RegisterClient />
        </CardContent>
      </Card>
    </div>
  );
}
