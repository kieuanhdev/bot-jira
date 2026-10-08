import { JiraRequestError } from "../errors";
import type { JiraAuth } from "../auth";
import type { JiraMyPermissions } from "../types";
import type { JiraRequest } from "./types";

export function createPermissionResource(request: JiraRequest, auth?: JiraAuth) {
  return {
    getMyPermissions: async (projectKey: string): Promise<JiraMyPermissions> => {
      if (!auth?.token) {
        throw new JiraRequestError(
          "Yêu cầu token Jira cá nhân để kiểm tra quyền dự án",
          401,
          false
        );
      }
      return request<JiraMyPermissions>(
        `/rest/api/2/mypermissions?projectKey=${encodeURIComponent(projectKey)}`
      );
    },
  };
}
