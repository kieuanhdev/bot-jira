import { StaleClient } from "./stale-client";

export const metadata = { title: "Stale tasks" };

export default function StalePage() {
  return <StaleClient />;
}
