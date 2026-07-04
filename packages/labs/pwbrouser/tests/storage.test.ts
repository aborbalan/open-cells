import fs from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  browser_cookie_clear,
  browser_cookie_delete,
  browser_cookie_get,
  browser_cookie_list,
  browser_cookie_set,
  browser_localstorage_clear,
  browser_localstorage_delete,
  browser_localstorage_get,
  browser_localstorage_list,
  browser_localstorage_set,
  browser_sessionstorage_clear,
  browser_sessionstorage_delete,
  browser_sessionstorage_get,
  browser_sessionstorage_list,
  browser_sessionstorage_set,
  browser_set_storage_state,
  browser_storage_state,
} from "../src/storage.js";

vi.mock("node:fs/promises");

const URL = "https://example.com/";
const SNAPSHOT = '- heading "Page" [ref=e1]';

function makePage(overrides: Record<string, unknown> = {}) {
  return {
    ariaSnapshot: vi.fn().mockResolvedValue(SNAPSHOT),
    url: vi.fn().mockReturnValue(URL),
    evaluate: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function makeContext(overrides: Record<string, unknown> = {}) {
  return {
    cookies: vi.fn().mockResolvedValue([]),
    addCookies: vi.fn().mockResolvedValue(undefined),
    clearCookies: vi.fn().mockResolvedValue(undefined),
    storageState: vi.fn().mockResolvedValue({ cookies: [], origins: [] }),
    ...overrides,
  };
}

function ctx(overrides: Record<string, unknown> = {}) {
  return {
    page: makePage(),
    context: makeContext(),
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("browser_cookie_list", () => {
  it("returns all cookies", async () => {
    const c = ctx({
      context: makeContext({
        cookies: vi.fn().mockResolvedValue([
          { name: "a", value: "1", domain: ".example.com", path: "/" },
          { name: "b", value: "2", domain: ".example.com", path: "/" },
        ]),
      }),
    });
    const result = await browser_cookie_list(c as never, {});
    expect(c.context.cookies).toHaveBeenCalledWith(undefined);
    expect(result.cookies as Array<Record<string, unknown>>).toHaveLength(2);
    expect(result.url).toBe(URL);
  });

  it("filters by domain", async () => {
    const c = ctx({
      context: makeContext({ cookies: vi.fn().mockResolvedValue([]) }),
    });
    await browser_cookie_list(c as never, { domain: "example.com" });
    expect(c.context.cookies).toHaveBeenCalledWith(["https://example.com/"]);
  });

  it("filters by path", async () => {
    const c = ctx({
      context: makeContext({
        cookies: vi.fn().mockResolvedValue([
          { name: "a", value: "1", domain: ".e.com", path: "/foo" },
          { name: "b", value: "2", domain: ".e.com", path: "/bar" },
        ]),
      }),
    });
    const result = await browser_cookie_list(c as never, { path: "/foo" });
    const cookies = result.cookies as Array<{ path: string }>;
    expect(cookies).toHaveLength(1);
    expect(cookies[0]!.path).toBe("/foo");
  });

  it("filters by domain and path", async () => {
    const c = ctx({
      context: makeContext({
        cookies: vi.fn().mockResolvedValue([
          { name: "a", value: "1", domain: ".e.com", path: "/foo" },
          { name: "b", value: "2", domain: ".e.com", path: "/bar" },
        ]),
      }),
    });
    const result = await browser_cookie_list(c as never, { domain: "example.com", path: "/bar" });
    expect(c.context.cookies).toHaveBeenCalledWith(["https://example.com/"]);
    const cookies = result.cookies as Array<{ path: string }>;
    expect(cookies).toHaveLength(1);
    expect(cookies[0]!.path).toBe("/bar");
  });
});

describe("browser_cookie_get", () => {
  it("returns cookie by name", async () => {
    const c = ctx({
      context: makeContext({
        cookies: vi.fn().mockResolvedValue([
          { name: "token", value: "abc", domain: ".e.com", path: "/" },
          { name: "other", value: "xyz", domain: ".e.com", path: "/" },
        ]),
      }),
    });
    const result = await browser_cookie_get(c as never, { name: "token" });
    const cookies = result.cookies as Array<{ value: string }>;
    expect(cookies).toHaveLength(1);
    expect(cookies[0]!.value).toBe("abc");
    expect(result.url).toBe(URL);
  });

  it("returns empty array if cookie not found", async () => {
    const c = ctx({
      context: makeContext({
        cookies: vi.fn().mockResolvedValue([{ name: "a", value: "1", domain: ".e.com", path: "/" }]),
      }),
    });
    const result = await browser_cookie_get(c as never, { name: "missing" });
    expect(result.cookies).toEqual([]);
  });

  it("throws if name is missing", async () => {
    const c = ctx();
    await expect(browser_cookie_get(c as never, {})).rejects.toThrow('"name"');
  });
});

describe("browser_cookie_set", () => {
  it("sets a cookie with default domain and path", async () => {
    const c = ctx();
    await browser_cookie_set(c as never, { name: "token", value: "abc" });
    expect(c.context.addCookies).toHaveBeenCalledWith([{ name: "token", value: "abc", domain: "", path: "/" }]);
    expect(await browser_cookie_set(c as never, { name: "token", value: "abc" })).toHaveProperty("success", true);
  });

  it("sets optional cookie fields", async () => {
    const c = ctx();
    await browser_cookie_set(c as never, {
      name: "token",
      value: "abc",
      domain: ".example.com",
      path: "/admin",
      expires: 1700000000,
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
    });
    expect(c.context.addCookies).toHaveBeenCalledWith([
      {
        name: "token",
        value: "abc",
        domain: ".example.com",
        path: "/admin",
        expires: 1700000000,
        httpOnly: true,
        secure: true,
        sameSite: "Strict",
      },
    ]);
  });

  it("throws if name is missing", async () => {
    await expect(browser_cookie_set(ctx() as never, { value: "abc" })).rejects.toThrow('"name"');
  });

  it("throws if value is missing", async () => {
    await expect(browser_cookie_set(ctx() as never, { name: "token" })).rejects.toThrow('"value"');
  });
});

describe("browser_cookie_delete", () => {
  it("deletes a cookie by name and re-adds others", async () => {
    const cookiesVal = [
      { name: "a", value: "1", domain: ".e.com", path: "/" },
      { name: "b", value: "2", domain: ".e.com", path: "/" },
      { name: "c", value: "3", domain: ".e.com", path: "/" },
    ];
    const c = ctx({ context: makeContext({ cookies: vi.fn().mockResolvedValue(cookiesVal) }) });

    const result = await browser_cookie_delete(c as never, { name: "b" });
    expect(c.context.cookies).toHaveBeenCalled();
    expect(c.context.clearCookies).toHaveBeenCalled();
    expect(c.context.addCookies).toHaveBeenCalledWith([
      { name: "a", value: "1", domain: ".e.com", path: "/" },
      { name: "c", value: "3", domain: ".e.com", path: "/" },
    ]);
    expect(result.success).toBe(true);
  });

  it("clears all if the only cookie is deleted", async () => {
    const c = ctx({
      context: makeContext({
        cookies: vi.fn().mockResolvedValue([{ name: "a", value: "1", domain: ".e.com", path: "/" }]),
      }),
    });
    await browser_cookie_delete(c as never, { name: "a" });
    expect(c.context.clearCookies).toHaveBeenCalled();
    expect(c.context.addCookies).not.toHaveBeenCalled();
  });

  it("throws if name is missing", async () => {
    await expect(browser_cookie_delete(ctx() as never, {})).rejects.toThrow('"name"');
  });
});

describe("browser_cookie_clear", () => {
  it("clears all cookies", async () => {
    const c = ctx();
    const result = await browser_cookie_clear(c as never, {});
    expect(c.context.clearCookies).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.url).toBe(URL);
  });
});

describe("localStorage methods", () => {
  it("list returns all items from page.evaluate", async () => {
    const items = [
      { key: "a", value: "1" },
      { key: "b", value: "2" },
    ];
    const c = ctx({ page: makePage({ evaluate: vi.fn().mockResolvedValue(items) }) });
    const result = await browser_localstorage_list(c as never, {});
    expect(c.page.evaluate).toHaveBeenCalled();
    expect(result.data).toEqual(items);
    expect(result.url).toBe(URL);
  });

  it("get returns value by key", async () => {
    const c = ctx({ page: makePage({ evaluate: vi.fn().mockResolvedValue("stored-value") }) });
    const result = await browser_localstorage_get(c as never, { key: "myKey" });
    expect(c.page.evaluate).toHaveBeenCalled();
    expect(result.value).toBe("stored-value");
  });

  it("get throws if key is missing", async () => {
    await expect(browser_localstorage_get(ctx() as never, {})).rejects.toThrow("key");
  });

  it("set stores key-value pair", async () => {
    const c = ctx();
    const result = await browser_localstorage_set(c as never, { key: "k", value: "v" });
    expect(c.page.evaluate).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it("set throws if key is missing", async () => {
    await expect(browser_localstorage_set(ctx() as never, { value: "v" })).rejects.toThrow("key");
  });

  it("set throws if value is missing", async () => {
    await expect(browser_localstorage_set(ctx() as never, { key: "k" })).rejects.toThrow("value");
  });

  it("delete removes item by key", async () => {
    const c = ctx();
    const result = await browser_localstorage_delete(c as never, { key: "k" });
    expect(c.page.evaluate).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it("delete throws if key is missing", async () => {
    await expect(browser_localstorage_delete(ctx() as never, {})).rejects.toThrow("key");
  });

  it("clear removes all items", async () => {
    const c = ctx();
    const result = await browser_localstorage_clear(c as never, {});
    expect(c.page.evaluate).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });
});

describe("sessionStorage methods", () => {
  it("list returns all items", async () => {
    const items = [{ key: "x", value: "y" }];
    const c = ctx({ page: makePage({ evaluate: vi.fn().mockResolvedValue(items) }) });
    const result = await browser_sessionstorage_list(c as never, {});
    expect(result.data).toEqual(items);
  });

  it("get returns value by key", async () => {
    const c = ctx({ page: makePage({ evaluate: vi.fn().mockResolvedValue("val") }) });
    const result = await browser_sessionstorage_get(c as never, { key: "k" });
    expect(result.value).toBe("val");
  });

  it("get throws if key is missing", async () => {
    await expect(browser_sessionstorage_get(ctx() as never, {})).rejects.toThrow("key");
  });

  it("set stores key-value pair", async () => {
    const c = ctx();
    await browser_sessionstorage_set(c as never, { key: "k", value: "v" });
    expect(c.page.evaluate).toHaveBeenCalled();
  });

  it("set throws if key is missing", async () => {
    await expect(browser_sessionstorage_set(ctx() as never, { value: "v" })).rejects.toThrow("key");
  });

  it("set throws if value is missing", async () => {
    await expect(browser_sessionstorage_set(ctx() as never, { key: "k" })).rejects.toThrow("value");
  });

  it("delete removes item", async () => {
    const c = ctx();
    const result = await browser_sessionstorage_delete(c as never, { key: "k" });
    expect(result.success).toBe(true);
  });

  it("delete throws if key is missing", async () => {
    await expect(browser_sessionstorage_delete(ctx() as never, {})).rejects.toThrow("key");
  });

  it("clear removes all items", async () => {
    const c = ctx();
    const result = await browser_sessionstorage_clear(c as never, {});
    expect(result.success).toBe(true);
  });
});

describe("browser_storage_state", () => {
  it("returns storage state as JSON", async () => {
    const state = { cookies: [{ name: "a", value: "1", domain: "e.com", path: "/" }], origins: [] };
    const c = ctx({ context: makeContext({ storageState: vi.fn().mockResolvedValue(state) }) });
    const result = await browser_storage_state(c as never, {});
    expect(c.context.storageState).toHaveBeenCalled();
    expect(result.storageState).toEqual(state);
    expect(result.url).toBe(URL);
  });

  it("writes to file when filename is provided", async () => {
    const state = { cookies: [], origins: [] };
    const c = ctx({ context: makeContext({ storageState: vi.fn().mockResolvedValue(state) }) });
    const writeFileSpy = vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    const result = await browser_storage_state(c as never, { filename: "/tmp/state.json" });
    expect(writeFileSpy).toHaveBeenCalledWith("/tmp/state.json", JSON.stringify(state, null, 2));
    expect(result.storageState).toBe("/tmp/state.json");
  });
});

describe("browser_set_storage_state", () => {
  it("sets cookies and localStorage from file", async () => {
    const readFileSpy = vi.mocked(fs.readFile).mockResolvedValue(
      JSON.stringify({
        cookies: [{ name: "a", value: "1", domain: ".e.com", path: "/" }],
        origins: [{ origin: "https://e.com", localStorage: [{ name: "k", value: "v" }] }],
      }),
    );
    const c = ctx();
    const result = await browser_set_storage_state(c as never, { filename: "/tmp/state.json" });
    expect(readFileSpy).toHaveBeenCalledWith("/tmp/state.json", "utf-8");
    expect(c.context.addCookies).toHaveBeenCalledWith([{ name: "a", value: "1", domain: ".e.com", path: "/" }]);
    expect(c.page.evaluate).toHaveBeenCalled();
    expect(result).toHaveProperty("snapshot", SNAPSHOT);
    expect(result).toHaveProperty("url", URL);
  });

  it("throws if filename is missing", async () => {
    await expect(browser_set_storage_state(ctx() as never, {})).rejects.toThrow('"filename"');
  });

  it("skips cookies when none in state", async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ cookies: [], origins: [] }));
    const c = ctx();
    await browser_set_storage_state(c as never, { filename: "/tmp/state.json" });
    expect(c.context.addCookies).not.toHaveBeenCalled();
  });

  it("skips localStorage when no origins in state", async () => {
    vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ cookies: [], origins: [] }));
    const c = ctx();
    await browser_set_storage_state(c as never, { filename: "/tmp/state.json" });
    expect(c.page.evaluate).not.toHaveBeenCalled();
  });
});
