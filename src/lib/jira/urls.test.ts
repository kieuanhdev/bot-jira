import { describe, expect, it } from "vitest";
import { getJiraIssueUrl, getJiraVersionUrl, trimBaseUrl } from "./urls";

describe("jira/urls", () => {
  describe("trimBaseUrl", () => {
    it("trims trailing slashes", () => {
      expect(trimBaseUrl("https://jira.example.com/")).toBe("https://jira.example.com");
      expect(trimBaseUrl("https://jira.example.com///")).toBe("https://jira.example.com");
      expect(trimBaseUrl("https://jira.example.com")).toBe("https://jira.example.com");
      expect(trimBaseUrl("")).toBe("");
      expect(trimBaseUrl(null)).toBe("");
      expect(trimBaseUrl(undefined)).toBe("");
    });
  });

  describe("getJiraIssueUrl", () => {
    it("builds deep link for valid base and key", () => {
      expect(getJiraIssueUrl("https://jira.example.com", "EPM-123")).toBe(
        "https://jira.example.com/browse/EPM-123"
      );
      expect(getJiraIssueUrl("https://jira.example.com/", "EPM-123")).toBe(
        "https://jira.example.com/browse/EPM-123"
      );
    });

    it("encodes special characters in issue key", () => {
      expect(getJiraIssueUrl("https://jira.example.com", "PROJ-1/2")).toBe(
        "https://jira.example.com/browse/PROJ-1%2F2"
      );
    });

    it("returns null if either base or key is missing", () => {
      expect(getJiraIssueUrl(null, "EPM-123")).toBeNull();
      expect(getJiraIssueUrl(undefined, "EPM-123")).toBeNull();
      expect(getJiraIssueUrl("", "EPM-123")).toBeNull();
      expect(getJiraIssueUrl("https://jira.example.com", null)).toBeNull();
      expect(getJiraIssueUrl("https://jira.example.com", undefined)).toBeNull();
      expect(getJiraIssueUrl("https://jira.example.com", "")).toBeNull();
    });
  });

  describe("getJiraVersionUrl", () => {
    it("builds version direct URL when jiraVersionId is provided", () => {
      expect(
        getJiraVersionUrl("https://jira.example.com", "PROJ", "10023", "v1.0.0")
      ).toBe("https://jira.example.com/projects/PROJ/versions/10023");
    });

    it("builds JQL query URL when only versionName is provided", () => {
      expect(
        getJiraVersionUrl("https://jira.example.com", "PROJ", null, "v1.0.0")
      ).toBe(
        "https://jira.example.com/issues/?jql=project%20%3D%20%22PROJ%22%20AND%20fixVersion%20%3D%20%22v1.0.0%22"
      );
    });

    it("returns null if baseUrl or projectKey is missing or neither version ID nor name exists", () => {
      expect(getJiraVersionUrl(null, "PROJ", "10023")).toBeNull();
      expect(getJiraVersionUrl("https://jira.example.com", null, "10023")).toBeNull();
      expect(getJiraVersionUrl("https://jira.example.com", "PROJ", null, null)).toBeNull();
    });
  });
});
