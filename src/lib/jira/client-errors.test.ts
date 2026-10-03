import { describe, it, expect, vi } from "vitest";
import { extractJiraErrorDetail, jiraWith, JiraRequestError } from "./client";

describe("Jira error handling and extraction", () => {
  it("extracts field errors and errorMessages from Jira JSON error response", () => {
    const rawBody = JSON.stringify({
      errorMessages: ["Global issue type error"],
      errors: {
        versions: "Could not find version with id '11200'",
        customfield_10300: "User 'vunt' does not exist.",
      },
    });

    const detail = extractJiraErrorDetail(rawBody);
    expect(detail).toContain("versions: Could not find version with id '11200'");
    expect(detail).toContain("customfield_10300: User 'vunt' does not exist.");
    expect(detail).toContain("Global issue type error");
  });

  it("safely ignores non-JSON and HTML responses without leaking raw HTML", () => {
    const htmlBody = "<html><body>502 Bad Gateway - internal server error</body></html>";
    expect(extractJiraErrorDetail(htmlBody)).toBeNull();
    expect(extractJiraErrorDetail("Plain text error")).toBeNull();
    expect(extractJiraErrorDetail("")).toBeNull();
    expect(extractJiraErrorDetail(null)).toBeNull();
  });

  it("strips HTML tags and normalizes whitespace in error messages", () => {
    const body = JSON.stringify({
      errors: {
        customfield_10501: "User <b>hunglm</b> is <i>not</i> assignable",
      },
    });

    const detail = extractJiraErrorDetail(body);
    expect(detail).toBe("customfield_10501: User hunglm is not assignable");
  });

  it("truncates excessively long error details to max length", () => {
    const longMessage = "a".repeat(400);
    const body = JSON.stringify({
      errorMessages: [longMessage],
    });

    const detail = extractJiraErrorDetail(body, 100);
    expect(detail?.length).toBe(100);
    expect(detail?.endsWith("...")).toBe(true);
  });

  it("attaches error details to JiraRequestError on HTTP 400", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          errors: {
            versions: "Could not find version with id '11200'",
            customfield_10300: "User 'vunt' does not exist.",
          },
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = jiraWith({ user: "alice", token: "tok", authMode: "Bearer" });

    await expect(
      client.createIssue({
        projectKey: "MHRM",
        summary: "Test task",
      })
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(JiraRequestError);
      const jErr = err as JiraRequestError;
      expect(jErr.status).toBe(400);
      expect(jErr.message).toContain("versions: Could not find version with id '11200'");
      expect(jErr.message).toContain("customfield_10300: User 'vunt' does not exist.");
      expect(jErr.errorDetails).toContain("versions:");
      return true;
    });

    vi.unstubAllGlobals();
  });
});
