import { cache } from "react";
import { QueryClient } from "@tanstack/react-query";
import { queryPolicy } from "./query-policy";

/**
 * Creates a request-scoped QueryClient instance for Server Components.
 * Wrapped with React.cache so multiple calls in the same request share the same instance,
 * while preventing cross-request cache leakage between users.
 */
export const getServerQueryClient = cache(() => {
  return new QueryClient({
    defaultOptions: {
      queries: queryPolicy.defaults,
    },
  });
});
