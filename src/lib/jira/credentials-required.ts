import { NextResponse } from "next/server";

/** 428 response returned by routes that need the caller's personal Jira token. */
export function jiraCredentialsRequired() {
  return NextResponse.json(
    { error: "Bạn cần cấu hình token Jira cá nhân trong Settings.", code: "jira_credentials_required" },
    { status: 428 }
  );
}
