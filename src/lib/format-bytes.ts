/** 1536 -> "1.5 KB". Jira reports sizes in bytes. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exp;
  return `${exp === 0 || value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[exp]}`;
}
