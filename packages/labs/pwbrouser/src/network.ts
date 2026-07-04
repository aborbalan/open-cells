import type { BrowserContext, Page } from "playwright";

export interface RouteConfig {
  pattern: string;
  status?: number;
  body?: string;
  contentType?: string;
  headers?: string[];
  removeHeaders?: string;
}

export interface NetworkContext {
  page: Page;
  context: BrowserContext;
  routes: Map<string, RouteConfig>;
}

function parseHeaders(headers: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const h of headers) {
    const idx = h.indexOf(":");
    if (idx > 0) {
      result[h.slice(0, idx).trim()] = h.slice(idx + 1).trim();
    }
  }
  return result;
}

export async function browser_route(
  ctx: NetworkContext,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const pattern = params.pattern as string;
  if (!pattern) throw new Error('browser_route requires "pattern" parameter');

  const config: RouteConfig = {
    pattern,
    status: params.status as number | undefined,
    body: params.body as string | undefined,
    contentType: params.contentType as string | undefined,
    headers: params.headers as string[] | undefined,
    removeHeaders: params.removeHeaders as string | undefined,
  };

  ctx.routes.set(pattern, config);

  await ctx.page.unroute(pattern).catch(() => {});
  await ctx.page.route(pattern, async (route) => {
    const currentConfig = ctx.routes.get(pattern) ?? config;
    const hasBody = currentConfig.body !== undefined || currentConfig.status !== undefined;

    if (hasBody) {
      const responseHeaders: Record<string, string> = {};
      if (currentConfig.contentType) {
        responseHeaders["content-type"] = currentConfig.contentType;
      }
      if (currentConfig.headers) {
        Object.assign(responseHeaders, parseHeaders(currentConfig.headers));
      }
      await route.fulfill({
        status: currentConfig.status ?? 200,
        contentType: currentConfig.contentType,
        body: currentConfig.body,
        headers: responseHeaders,
      });
    } else if (currentConfig.removeHeaders) {
      const removeList = currentConfig.removeHeaders.split(",").map((h) => h.trim().toLowerCase());
      const requestHeaders = route.request().headers();
      const filtered: Record<string, string> = {};
      for (const [key, value] of Object.entries(requestHeaders)) {
        if (!removeList.includes(key.toLowerCase())) {
          filtered[key] = value;
        }
      }
      await route.continue({ headers: filtered });
    } else {
      await route.continue();
    }
  });

  return { success: true, url: ctx.page.url() };
}

export async function browser_route_list(
  ctx: NetworkContext,
  _params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const routes = Array.from(ctx.routes.values()).map((r) => ({
    pattern: r.pattern,
    status: r.status ?? 200,
  }));
  return { routes, url: ctx.page.url() };
}

export async function browser_unroute(
  ctx: NetworkContext,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const pattern = params.pattern as string | undefined;

  if (pattern) {
    ctx.routes.delete(pattern);
    await ctx.page.unroute(pattern);
  } else {
    ctx.routes.clear();
    await ctx.page.unrouteAll();
  }

  return { success: true, url: ctx.page.url() };
}

export async function browser_network_state_set(
  ctx: NetworkContext,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const state = params.state as string;
  if (!state) throw new Error('browser_network_state_set requires "state" parameter');
  if (state !== "online" && state !== "offline") {
    throw new Error(`Invalid network state: ${state}. Must be "online" or "offline".`);
  }
  await ctx.context.setOffline(state === "offline");
  return { success: true, state, url: ctx.page.url() };
}

export const networkMethods: Record<
  string,
  (ctx: NetworkContext, params: Record<string, unknown>) => Promise<Record<string, unknown>>
> = {
  browser_route,
  browser_route_list,
  browser_unroute,
  browser_network_state_set,
};
