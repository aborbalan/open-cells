import type { Page } from "playwright";
import { captureSnapshot } from "./snapshot.js";
import { resolveTarget } from "./target.js";
import type { ConsoleMessageEntry, NetworkRequestEntry, Target } from "./types.js";

interface ReadOnlyContext {
  page: Page;
  consoleMessages: ConsoleMessageEntry[];
  networkRequests: NetworkRequestEntry[];
  navIndex: number;
}

function hasTarget(target: unknown): target is Target {
  if (!target || typeof target !== "object") return false;
  const t = target as Record<string, unknown>;
  return !!(t.ref || t.role || t.selector);
}

export async function browser_snapshot(
  ctx: ReadOnlyContext,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const target = params.target as Target | undefined;
  if (target && hasTarget(target)) {
    const locator = resolveTarget(ctx.page, target);
    const snapshot =
      (await (locator.ariaSnapshot as (opts?: { ref?: boolean }) => Promise<string | null>)({ ref: true })) ?? "";
    return { snapshot, url: ctx.page.url() };
  }
  const snapshot = await captureSnapshot(ctx.page);
  return { snapshot, url: ctx.page.url() };
}

export async function browser_take_screenshot(
  ctx: ReadOnlyContext,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const target = params.target as Target | undefined;
  const type = (params.type as string) || "png";
  const fullPage = params.fullPage as boolean | undefined;
  const filename = params.filename as string | undefined;

  const screenshotOptions: Record<string, unknown> = {
    type: type as "png" | "jpeg",
    fullPage: fullPage ?? false,
  };
  if (filename) screenshotOptions.path = filename;

  if (target && hasTarget(target)) {
    const locator = resolveTarget(ctx.page, target);
    const buffer = await locator.screenshot(screenshotOptions);
    if (filename) return { screenshot: filename, url: ctx.page.url() };
    return { screenshot: buffer.toString("base64"), url: ctx.page.url() };
  }

  const buffer = await ctx.page.screenshot(screenshotOptions);
  if (filename) return { screenshot: filename, url: ctx.page.url() };
  return { screenshot: buffer.toString("base64"), url: ctx.page.url() };
}

const LEVEL_SEVERITY: Record<string, number> = { debug: 0, info: 1, warning: 2, error: 3, log: 1 };

export async function browser_console_messages(
  ctx: ReadOnlyContext,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const level = (params.level as string) || "info";
  const all = params.all as boolean | undefined;
  const minSeverity = LEVEL_SEVERITY[level] ?? 1;

  const start = all ? 0 : ctx.navIndex;
  const messages = ctx.consoleMessages.slice(start).filter((m) => (LEVEL_SEVERITY[m.type] ?? 1) >= minSeverity);
  return { messages, url: ctx.page.url() };
}

const STATIC_TYPES = new Set(["image", "font", "script", "stylesheet", "media", "manifest"]);

export async function browser_network_requests(
  ctx: ReadOnlyContext,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const includeStatic = params.static as boolean | undefined;
  const filter = params.filter as string | undefined;

  let requests = ctx.networkRequests.slice(ctx.navIndex);
  if (!includeStatic) {
    requests = requests.filter((r) => !STATIC_TYPES.has(r.type));
  }
  if (filter) {
    const re = new RegExp(filter);
    requests = requests.filter((r) => re.test(r.url));
  }

  return {
    requests: requests.map(({ _request: _r, _response: _rp, ...rest }) => rest),
    url: ctx.page.url(),
  };
}

export async function browser_network_request(
  ctx: ReadOnlyContext,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const index = params.index as number;
  const part = params.part as string | undefined;

  const record = ctx.networkRequests.find((r) => r.index === index);
  if (!record) throw new Error(`Network request with index ${index} not found`);

  const result: Record<string, unknown> = { url: ctx.page.url() };

  if (!part || part === "request") {
    const req = record._request as {
      url: () => string;
      method: () => string;
      headers: () => Record<string, string>;
      postData: () => string | undefined | null;
    };
    result.request = {
      url: req.url(),
      method: req.method(),
      headers: req.headers(),
      body: req.postData() ?? null,
    };
  }

  if (!part || part === "response") {
    const resp = record._response as
      | { status: () => number; headers: () => Record<string, string>; body: () => Promise<Buffer> }
      | undefined;
    if (resp) {
      const body = await resp.body();
      result.response = {
        status: resp.status(),
        headers: resp.headers(),
        body: body.toString("base64"),
      };
    }
  }

  return result;
}

export const readonlyMethods: Record<
  string,
  (ctx: ReadOnlyContext, params: Record<string, unknown>) => Promise<Record<string, unknown>>
> = {
  browser_snapshot,
  browser_take_screenshot,
  browser_console_messages,
  browser_network_requests,
  browser_network_request,
};
