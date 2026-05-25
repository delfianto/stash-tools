/**
 * Subset of Python strftime tokens sufficient for stash.conf date_format values.
 * Unrecognised tokens are left verbatim (same as Python behaviour).
 */
export function strftime(fmt: string, date: Date): string {
  return fmt
    .replace(/%Y/g, date.getFullYear().toString())
    .replace(/%y/g, (date.getFullYear() % 100).toString().padStart(2, "0"))
    .replace(/%m/g, (date.getMonth() + 1).toString().padStart(2, "0"))
    .replace(/%d/g, date.getDate().toString().padStart(2, "0"))
    .replace(/%H/g, date.getHours().toString().padStart(2, "0"))
    .replace(/%M/g, date.getMinutes().toString().padStart(2, "0"))
    .replace(/%S/g, date.getSeconds().toString().padStart(2, "0"));
}
