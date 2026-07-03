import type { Page } from "playwright";

export async function captureSnapshot(page: Page): Promise<string> {
  const snapshot = await (page.ariaSnapshot as (opts?: { ref?: boolean }) => Promise<string | null>)({ ref: true });
  return snapshot ?? "";
}
