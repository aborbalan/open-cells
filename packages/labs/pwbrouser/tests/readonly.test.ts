import { describe, expect, it, vi } from "vitest";
import {
  browser_console_messages,
  browser_network_request,
  browser_network_requests,
  browser_snapshot,
  browser_take_screenshot,
} from "../src/readonly.js";

const SNAPSHOT = '- heading "Page" [ref=e1]';
const URL = "https://example.com/";

function makePage() {
  return {
    ariaSnapshot: vi.fn().mockResolvedValue(SNAPSHOT),
    url: vi.fn().mockReturnValue(URL),
    screenshot: vi.fn().mockResolvedValue(Buffer.from("fake-png")),
    locator: vi.fn().mockReturnValue({ __refLocator: true }),
    getByRole: vi.fn().mockReturnValue({
      first: vi.fn().mockReturnValue({ __roleLocator: true }),
    }),
  } as never;
}

function ctx(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    page: makePage(),
    consoleMessages: [],
    networkRequests: [],
    navIndex: 0,
    ...overrides,
  } as Parameters<typeof browser_snapshot>[0];
}

describe("browser_snapshot", () => {
  it("captures full page snapshot", async () => {
    const c = ctx();
    const result = await browser_snapshot(c, {});
    expect(c.page.ariaSnapshot).toHaveBeenCalledWith({ ref: true });
    expect(result).toEqual({ snapshot: SNAPSHOT, url: URL });
  });

  it("captures element snapshot when target is provided", async () => {
    const c = ctx();
    const locatorAriaSnapshot = vi.fn().mockResolvedValue('- button "Click" [ref=e1]');
    const locator = { ariaSnapshot: locatorAriaSnapshot };
    c.page.locator = vi.fn().mockReturnValue(locator);

    const result = await browser_snapshot(c, { target: { ref: "e5" } });
    expect(c.page.locator).toHaveBeenCalledWith('[data-ref="e5"]');
    expect(locatorAriaSnapshot).toHaveBeenCalledWith({ ref: true });
    expect(result.snapshot).toBe('- button "Click" [ref=e1]');
  });

  it("ignores empty target", async () => {
    const c = ctx();
    const result = await browser_snapshot(c, { target: {} });
    expect(c.page.ariaSnapshot).toHaveBeenCalled();
    expect(result).toEqual({ snapshot: SNAPSHOT, url: URL });
  });
});

describe("browser_take_screenshot", () => {
  it("takes full page screenshot and returns base64", async () => {
    const c = ctx();
    const result = await browser_take_screenshot(c, {});
    expect(c.page.screenshot).toHaveBeenCalledWith({ type: "png", fullPage: false });
    expect(result.screenshot).toBe(Buffer.from("fake-png").toString("base64"));
    expect(result.url).toBe(URL);
  });

  it("takes JPEG screenshot when type is jpeg", async () => {
    const c = ctx();
    await browser_take_screenshot(c, { type: "jpeg" });
    expect(c.page.screenshot).toHaveBeenCalledWith({ type: "jpeg", fullPage: false });
  });

  it("takes full page screenshot when fullPage is true", async () => {
    const c = ctx();
    await browser_take_screenshot(c, { fullPage: true });
    expect(c.page.screenshot).toHaveBeenCalledWith({ type: "png", fullPage: true });
  });

  it("saves to file when filename is provided", async () => {
    const c = ctx();
    const result = await browser_take_screenshot(c, { filename: "/tmp/shot.png" });
    expect(c.page.screenshot).toHaveBeenCalledWith({ type: "png", fullPage: false, path: "/tmp/shot.png" });
    expect(result.screenshot).toBe("/tmp/shot.png");
  });

  it("takes element screenshot when target is provided", async () => {
    const c = ctx();
    const elementScreenshot = vi.fn().mockResolvedValue(Buffer.from("elem-png"));
    c.page.locator = vi.fn().mockReturnValue({ screenshot: elementScreenshot });

    const result = await browser_take_screenshot(c, { target: { ref: "e5" } });
    expect(elementScreenshot).toHaveBeenCalledWith({ type: "png", fullPage: false });
    expect(result.screenshot).toBe(Buffer.from("elem-png").toString("base64"));
  });

  it("saves element screenshot to file when filename is provided", async () => {
    const c = ctx();
    const elementScreenshot = vi.fn().mockResolvedValue(Buffer.from("elem-png"));
    c.page.locator = vi.fn().mockReturnValue({ screenshot: elementScreenshot });

    const result = await browser_take_screenshot(c, { target: { ref: "e5" }, filename: "/tmp/elem.png" });
    expect(elementScreenshot).toHaveBeenCalledWith({ type: "png", fullPage: false, path: "/tmp/elem.png" });
    expect(result.screenshot).toBe("/tmp/elem.png");
  });
});

describe("browser_console_messages", () => {
  it("returns messages filtered by level since navIndex", () => {
    const c = ctx({
      consoleMessages: [
        { type: "log", text: "hello", timestamp: 1 },
        { type: "error", text: "boom", timestamp: 2 },
        { type: "warning", text: "hmm", timestamp: 3 },
        { type: "debug", text: "trace", timestamp: 4 },
      ],
      navIndex: 1,
    });

    return browser_console_messages(c, { level: "warning" }).then((result) => {
      const msgs = result.messages as Array<{ type: string }>;
      expect(msgs).toHaveLength(2);
      expect(msgs[0]!.type).toBe("error");
      expect(msgs[1]!.type).toBe("warning");
    });
  });

  it("returns all messages when all is true", () => {
    const c = ctx({
      consoleMessages: [
        { type: "error", text: "e1", timestamp: 1 },
        { type: "log", text: "l1", timestamp: 2 },
      ],
      navIndex: 1,
    });

    return browser_console_messages(c, { all: true }).then((result) => {
      const msgs = result.messages as Array<{ type: string }>;
      expect(msgs).toHaveLength(2);
    });
  });

  it("defaults to info level", () => {
    const c = ctx({
      consoleMessages: [
        { type: "debug", text: "d", timestamp: 1 },
        { type: "log", text: "l", timestamp: 2 },
      ],
    });

    return browser_console_messages(c, {}).then((result) => {
      const msgs = result.messages as Array<{ type: string }>;
      expect(msgs).toHaveLength(1);
      expect(msgs[0]!.type).toBe("log");
    });
  });
});

describe("browser_network_requests", () => {
  function makeEntry(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      index: (overrides.index as number) ?? 1,
      url: (overrides.url as string) ?? "https://example.com/api",
      method: (overrides.method as string) ?? "GET",
      status: (overrides.status as number) ?? 200,
      statusText: (overrides.statusText as string) ?? "OK",
      type: (overrides.type as string) ?? "xhr",
      _request: null,
      _response: null,
    } as never;
  }

  it("returns requests since navIndex", () => {
    const c = ctx({
      networkRequests: [
        makeEntry({ index: 1, url: "/old", type: "xhr" }),
        makeEntry({ index: 2, url: "/new", type: "xhr" }),
      ],
      navIndex: 1,
    });

    return browser_network_requests(c, {}).then((result) => {
      const reqs = result.requests as Array<{ url: string }>;
      expect(reqs).toHaveLength(1);
      expect(reqs[0]!.url).toBe("/new");
    });
  });

  it("excludes static resources by default", () => {
    const c = ctx({
      networkRequests: [
        makeEntry({ index: 1, url: "/api", type: "xhr" }),
        makeEntry({ index: 2, url: "/img.png", type: "image" }),
        makeEntry({ index: 3, url: "/app.js", type: "script" }),
      ],
    });

    return browser_network_requests(c, {}).then((result) => {
      const reqs = result.requests as Array<{ type: string }>;
      expect(reqs).toHaveLength(1);
      expect(reqs[0]!.type).toBe("xhr");
    });
  });

  it("includes static resources when static is true", () => {
    const c = ctx({
      networkRequests: [
        makeEntry({ index: 1, url: "/api", type: "xhr" }),
        makeEntry({ index: 2, url: "/img.png", type: "image" }),
      ],
    });

    return browser_network_requests(c, { static: true }).then((result) => {
      const reqs = result.requests as Array<{ type: string }>;
      expect(reqs).toHaveLength(2);
    });
  });

  it("filters by URL regex", () => {
    const c = ctx({
      networkRequests: [
        makeEntry({ index: 1, url: "/api/users", type: "xhr" }),
        makeEntry({ index: 2, url: "/api/posts", type: "xhr" }),
      ],
    });

    return browser_network_requests(c, { filter: "/api/user" }).then((result) => {
      const reqs = result.requests as Array<{ url: string }>;
      expect(reqs).toHaveLength(1);
      expect(reqs[0]!.url).toBe("/api/users");
    });
  });

  it("strips _request and _response from output", () => {
    const c = ctx({
      networkRequests: [makeEntry({ index: 1 })],
    });

    return browser_network_requests(c, {}).then((result) => {
      const reqs = result.requests as Array<Record<string, unknown>>;
      expect(reqs[0]).not.toHaveProperty("_request");
      expect(reqs[0]).not.toHaveProperty("_response");
    });
  });
});

describe("browser_network_request", () => {
  it("returns request and response details", async () => {
    const c = ctx({
      networkRequests: [
        {
          index: 1,
          url: "/api/data",
          method: "POST",
          status: 201,
          statusText: "Created",
          type: "fetch",
          _request: {
            url: () => "/api/data",
            method: () => "POST",
            headers: () => ({ "content-type": "application/json" }),
            postData: () => '{"key":"value"}',
          },
          _response: {
            status: () => 201,
            headers: () => ({ "content-type": "application/json" }),
            body: async () => Buffer.from('{"created":true}'),
          },
        },
      ] as never,
    });

    const result = await browser_network_request(c, { index: 1 });
    expect((result.request as Record<string, unknown>).method).toBe("POST");
    expect((result.request as Record<string, unknown>).body).toBe('{"key":"value"}');
    expect((result.response as Record<string, unknown>).status).toBe(201);
    expect((result.response as Record<string, unknown>).body).toBe(Buffer.from('{"created":true}').toString("base64"));
  });

  it("returns only request when part is request", async () => {
    const c = ctx({
      networkRequests: [
        {
          index: 1,
          url: "/api",
          method: "GET",
          status: 200,
          statusText: "OK",
          type: "fetch",
          _request: {
            url: () => "/api",
            method: () => "GET",
            headers: () => ({}),
            postData: () => null,
          },
          _response: null,
        },
      ] as never,
    });

    const result = await browser_network_request(c, { index: 1, part: "request" });
    expect(result).toHaveProperty("request");
    expect(result).not.toHaveProperty("response");
  });

  it("throws when index is not found", async () => {
    const c = ctx({ networkRequests: [] });
    await expect(browser_network_request(c, { index: 99 })).rejects.toThrow("not found");
  });
});
