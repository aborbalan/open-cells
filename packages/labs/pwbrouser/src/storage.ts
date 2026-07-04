import fs from "node:fs/promises";
import type { BrowserContext, Page } from "playwright";
import { captureSnapshot } from "./snapshot.js";

interface StorageContext {
  page: Page;
  context: BrowserContext;
}

async function snap(ctx: StorageContext) {
  const snapshot = await captureSnapshot(ctx.page);
  return { snapshot, url: ctx.page.url() };
}

// ---- Cookies ----

export async function browser_cookie_list(
  ctx: StorageContext,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const domain = params.domain as string | undefined;
  const path = params.path as string | undefined;
  const urls = domain ? [`https://${domain}/`] : undefined;
  let cookies = await ctx.context.cookies(urls);
  if (path) {
    cookies = cookies.filter((c) => c.path === path);
  }
  return { cookies, url: ctx.page.url() };
}

export async function browser_cookie_get(
  ctx: StorageContext,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const name = params.name as string;
  if (!name) throw new Error('browser_cookie_get requires "name" parameter');
  const cookies = await ctx.context.cookies();
  const cookie = cookies.find((c) => c.name === name);
  return { cookies: cookie ? [cookie] : [], url: ctx.page.url() };
}

export async function browser_cookie_set(
  ctx: StorageContext,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const name = params.name as string;
  const value = params.value as string;
  if (!name) throw new Error('browser_cookie_set requires "name" parameter');
  if (value === undefined || value === null) throw new Error('browser_cookie_set requires "value" parameter');

  const cookie: Record<string, unknown> = { name, value, domain: params.domain ?? "", path: params.path ?? "/" };
  if (params.expires !== undefined) cookie.expires = Number(params.expires);
  if (params.httpOnly !== undefined) cookie.httpOnly = Boolean(params.httpOnly);
  if (params.secure !== undefined) cookie.secure = Boolean(params.secure);
  if (params.sameSite !== undefined) cookie.sameSite = params.sameSite;

  await ctx.context.addCookies([cookie as Parameters<BrowserContext["addCookies"]>[0][number]]);
  return { success: true, url: ctx.page.url() };
}

export async function browser_cookie_delete(
  ctx: StorageContext,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const name = params.name as string;
  if (!name) throw new Error('browser_cookie_delete requires "name" parameter');
  const allCookies = await ctx.context.cookies();
  const remaining = allCookies.filter((c) => c.name !== name);
  await ctx.context.clearCookies();
  if (remaining.length > 0) {
    await ctx.context.addCookies(remaining);
  }
  return { success: true, url: ctx.page.url() };
}

export async function browser_cookie_clear(
  ctx: StorageContext,
  _params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  await ctx.context.clearCookies();
  return { success: true, url: ctx.page.url() };
}

// ---- localStorage ----

function storageEvaluate(store: "localStorage" | "sessionStorage") {
  return async (page: Page, action: string, key?: string, value?: string) => {
    return page.evaluate(
      ({ action, key, value, store }) => {
        const s = store === "localStorage" ? localStorage : sessionStorage;
        switch (action) {
          case "list": {
            const items: Array<{ key: string; value: string }> = [];
            for (let i = 0; i < s.length; i++) {
              const k = s.key(i);
              if (k !== null) {
                items.push({ key: k, value: s.getItem(k) ?? "" });
              }
            }
            return items;
          }
          case "get":
            return key !== undefined ? s.getItem(key) : null;
          case "set":
            if (key !== undefined && value !== undefined) s.setItem(key, value);
            return null;
          case "delete":
            if (key !== undefined) s.removeItem(key);
            return null;
          case "clear":
            s.clear();
            return null;
          default:
            return null;
        }
      },
      { action, key, value, store },
    );
  };
}

const localStorageEval = storageEvaluate("localStorage");
const sessionStorageEval = storageEvaluate("sessionStorage");

function makeStorageMethods(evalFn: ReturnType<typeof storageEvaluate>) {
  return {
    async list(ctx: StorageContext): Promise<Record<string, unknown>> {
      const data = await evalFn(ctx.page, "list");
      return { data, url: ctx.page.url() };
    },
    async get(ctx: StorageContext, params: Record<string, unknown>): Promise<Record<string, unknown>> {
      const key = params.key as string;
      if (key === undefined || key === null) throw new Error("storage get requires a key parameter");
      const value = await evalFn(ctx.page, "get", key);
      return { value, url: ctx.page.url() };
    },
    async set(ctx: StorageContext, params: Record<string, unknown>): Promise<Record<string, unknown>> {
      const key = params.key as string;
      const value = params.value as string;
      if (key === undefined || key === null) throw new Error("storage set requires a key parameter");
      if (value === undefined || value === null) throw new Error("storage set requires a value parameter");
      await evalFn(ctx.page, "set", key, value);
      return { success: true, url: ctx.page.url() };
    },
    async delete(ctx: StorageContext, params: Record<string, unknown>): Promise<Record<string, unknown>> {
      const key = params.key as string;
      if (key === undefined || key === null) throw new Error("storage delete requires a key parameter");
      await evalFn(ctx.page, "delete", key);
      return { success: true, url: ctx.page.url() };
    },
    async clear(ctx: StorageContext): Promise<Record<string, unknown>> {
      await evalFn(ctx.page, "clear");
      return { success: true, url: ctx.page.url() };
    },
  };
}

const localStorageMethods = makeStorageMethods(localStorageEval);
const sessionStorageMethods = makeStorageMethods(sessionStorageEval);

export async function browser_localstorage_list(ctx: StorageContext, _p: Record<string, unknown>) {
  return localStorageMethods.list(ctx);
}
export async function browser_localstorage_get(ctx: StorageContext, p: Record<string, unknown>) {
  return localStorageMethods.get(ctx, p);
}
export async function browser_localstorage_set(ctx: StorageContext, p: Record<string, unknown>) {
  return localStorageMethods.set(ctx, p);
}
export async function browser_localstorage_delete(ctx: StorageContext, p: Record<string, unknown>) {
  return localStorageMethods.delete(ctx, p);
}
export async function browser_localstorage_clear(ctx: StorageContext, _p: Record<string, unknown>) {
  return localStorageMethods.clear(ctx);
}

export async function browser_sessionstorage_list(ctx: StorageContext, _p: Record<string, unknown>) {
  return sessionStorageMethods.list(ctx);
}
export async function browser_sessionstorage_get(ctx: StorageContext, p: Record<string, unknown>) {
  return sessionStorageMethods.get(ctx, p);
}
export async function browser_sessionstorage_set(ctx: StorageContext, p: Record<string, unknown>) {
  return sessionStorageMethods.set(ctx, p);
}
export async function browser_sessionstorage_delete(ctx: StorageContext, p: Record<string, unknown>) {
  return sessionStorageMethods.delete(ctx, p);
}
export async function browser_sessionstorage_clear(ctx: StorageContext, _p: Record<string, unknown>) {
  return sessionStorageMethods.clear(ctx);
}

// ---- Storage State ----

export async function browser_storage_state(
  ctx: StorageContext,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const filename = params.filename as string | undefined;
  const state = await ctx.context.storageState();
  if (filename) {
    await fs.writeFile(filename, JSON.stringify(state, null, 2));
    return { storageState: filename, url: ctx.page.url() };
  }
  return { storageState: state, url: ctx.page.url() };
}

export async function browser_set_storage_state(
  ctx: StorageContext,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const filename = params.filename as string;
  if (!filename) throw new Error('browser_set_storage_state requires "filename" parameter');
  const raw = await fs.readFile(filename, "utf-8");
  const state = JSON.parse(raw) as {
    cookies: Array<{ name: string; value: string; domain: string; path: string }>;
    origins: Array<{
      origin: string;
      localStorage: Array<{ name: string; value: string }>;
    }>;
  };
  if (state.cookies && state.cookies.length > 0) {
    await ctx.context.addCookies(state.cookies);
  }
  if (state.origins && state.origins.length > 0) {
    for (const origin of state.origins) {
      if (origin.localStorage && origin.localStorage.length > 0) {
        await ctx.page.evaluate(
          ({ items }) => {
            for (const item of items) {
              localStorage.setItem(item.name, item.value);
            }
          },
          { items: origin.localStorage },
        );
      }
    }
  }
  return await snap(ctx);
}

// ---- Registry ----

type StorageHandler = (ctx: StorageContext, params: Record<string, unknown>) => Promise<Record<string, unknown>>;

export const storageMethods: Record<string, StorageHandler> = {
  browser_cookie_list,
  browser_cookie_get,
  browser_cookie_set,
  browser_cookie_delete,
  browser_cookie_clear,
  browser_localstorage_list,
  browser_localstorage_get,
  browser_localstorage_set,
  browser_localstorage_delete,
  browser_localstorage_clear,
  browser_sessionstorage_list,
  browser_sessionstorage_get,
  browser_sessionstorage_set,
  browser_sessionstorage_delete,
  browser_sessionstorage_clear,
  browser_storage_state,
  browser_set_storage_state,
};
