import type { Page } from "playwright";
import { describe, expect, it, vi } from "vitest";
import { resolveTarget } from "../src/target.js";

function makeMockPage() {
  const locator = vi.fn().mockReturnValue({ __locator: true });
  const getByRole = vi.fn().mockReturnValue({ first: vi.fn().mockReturnValue({ __roleLocator: true }) });
  return { locator, getByRole } as unknown as Page;
}

describe("resolveTarget", () => {
  it("resolves by ref", () => {
    const page = makeMockPage();
    const result = resolveTarget(page, { ref: "e15" });
    expect(page.locator).toHaveBeenCalledWith('[data-ref="e15"]');
    expect(result).toEqual({ __locator: true });
  });

  it("resolves by role with name", () => {
    const page = makeMockPage();
    const result = resolveTarget(page, { role: "button", name: "Search" });
    expect(page.getByRole).toHaveBeenCalledWith("button", { name: "Search" });
    expect(result).toEqual({ __roleLocator: true });
  });

  it("resolves by role without name", () => {
    const page = makeMockPage();
    resolveTarget(page, { role: "textbox" });
    expect(page.getByRole).toHaveBeenCalledWith("textbox");
  });

  it("resolves by selector", () => {
    const page = makeMockPage();
    const result = resolveTarget(page, { selector: "button.submit" });
    expect(page.locator).toHaveBeenCalledWith("button.submit");
    expect(result).toEqual({ __locator: true });
  });

  it("prefers ref over role over selector", () => {
    const page = makeMockPage();
    resolveTarget(page, { ref: "e1", role: "button", selector: ".btn" });
    expect(page.locator).toHaveBeenCalledWith('[data-ref="e1"]');
    expect(page.getByRole).not.toHaveBeenCalled();
  });

  it("falls back to role when ref is empty", () => {
    const page = makeMockPage();
    resolveTarget(page, { ref: "", role: "button" });
    expect(page.locator).not.toHaveBeenCalled();
    expect(page.getByRole).toHaveBeenCalled();
  });

  it("falls back to selector when role is empty", () => {
    const page = makeMockPage();
    resolveTarget(page, { ref: "", role: "", selector: ".btn" });
    expect(page.getByRole).not.toHaveBeenCalled();
    expect(page.locator).toHaveBeenCalledWith(".btn");
  });

  it("throws when no valid target is provided", () => {
    const page = makeMockPage();
    expect(() => resolveTarget(page, {})).toThrow("Invalid target");
    expect(() => resolveTarget(page, {} as never)).toThrow("Invalid target");
  });
});
