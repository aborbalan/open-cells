import type { Locator, Page } from "playwright";
import type { Target } from "./types.js";

export function resolveTarget(page: Page, target: Target): Locator {
  if (target.ref) {
    return page.locator(`[data-ref="${target.ref}"]`);
  }
  if (target.role) {
    if (target.name) {
      return page.getByRole(target.role as Parameters<Page["getByRole"]>[0], { name: target.name }).first();
    }
    return page.getByRole(target.role as Parameters<Page["getByRole"]>[0]).first();
  }
  if (target.selector) {
    return page.locator(target.selector);
  }
  throw new Error("Invalid target: must provide ref, role, or selector");
}
