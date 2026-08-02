import { describe, expect, it, vi } from 'vitest';
import {
  browser_network_state_set,
  browser_route,
  browser_route_list,
  browser_unroute,
  type NetworkContext,
  type RouteConfig,
} from '../src/network.js';

const URL = 'https://example.com/';

function makePage() {
  return {
    url: vi.fn().mockReturnValue(URL),
    unroute: vi.fn().mockResolvedValue(undefined),
    route: vi.fn().mockResolvedValue(undefined),
    unrouteAll: vi.fn().mockResolvedValue(undefined),
  } as unknown as NetworkContext['page'];
}

function makeContext() {
  return {
    setOffline: vi.fn().mockResolvedValue(undefined),
  } as unknown as NetworkContext['context'];
}

function ctx(overrides: Partial<NetworkContext> = {}): NetworkContext {
  return {
    page: makePage(),
    context: makeContext(),
    routes: new Map<string, RouteConfig>(),
    ...overrides,
  } as NetworkContext;
}

function makeMockRoute() {
  return {
    fulfill: vi.fn().mockResolvedValue(undefined),
    continue: vi.fn().mockResolvedValue(undefined),
    request: () => ({
      headers: () => ({
        cookie: 'session=abc',
        'user-agent': 'test',
        'content-type': 'application/json',
      }),
    }),
  };
}

describe('browser_route', () => {
  it('throws if pattern is missing', async () => {
    await expect(browser_route(ctx(), {} as never)).rejects.toThrow('"pattern"');
  });

  it('stores config in routes map', async () => {
    const c = ctx();
    await browser_route(c, { pattern: '**/api/*' });
    expect(c.routes.has('**/api/*')).toBe(true);
    expect(c.routes.get('**/api/*')!.pattern).toBe('**/api/*');
  });

  it('calls page.unroute then page.route with pattern', async () => {
    const c = ctx();
    await browser_route(c, { pattern: '**/api/*', status: 201, body: '{"ok":true}' });
    expect(c.page.unroute).toHaveBeenCalledWith('**/api/*');
    expect(c.page.route).toHaveBeenCalledWith('**/api/*', expect.any(Function));
  });

  it('calling page.route again on same pattern overwrites', async () => {
    const c = ctx();
    await browser_route(c, { pattern: '**/api/*', status: 200 });
    await browser_route(c, { pattern: '**/api/*', status: 500 });
    expect(c.page.unroute).toHaveBeenCalledTimes(2);
    expect(c.page.route).toHaveBeenCalledTimes(2);
    expect(c.routes.size).toBe(1);
  });

  it('handler fulfills with provided status and body', async () => {
    const c = ctx();
    const mockRoute = makeMockRoute();

    let capturedHandler: ((route: unknown) => Promise<void>) | null = null;
    c.page.route = vi
      .fn()
      .mockImplementation((_pattern: string, handler: (route: unknown) => Promise<void>) => {
        capturedHandler = handler;
      });

    await browser_route(c, {
      pattern: '**/api/*',
      status: 201,
      body: '{"ok":true}',
      contentType: 'application/json',
    });

    expect(capturedHandler).not.toBeNull();
    await capturedHandler!(mockRoute);

    expect(mockRoute.fulfill).toHaveBeenCalledWith({
      status: 201,
      contentType: 'application/json',
      body: '{"ok":true}',
      headers: { 'content-type': 'application/json' },
    });
  });

  it('handler fulfills with extra headers', async () => {
    const c = ctx();
    const mockRoute = makeMockRoute();
    let capturedHandler: ((route: unknown) => Promise<void>) | null = null;
    c.page.route = vi
      .fn()
      .mockImplementation((_pattern: string, handler: (route: unknown) => Promise<void>) => {
        capturedHandler = handler;
      });

    await browser_route(c, {
      pattern: '**/api/*',
      body: 'test',
      headers: ['X-Custom: value1', 'X-Another: value2'],
    });

    await capturedHandler!(mockRoute);

    expect(mockRoute.fulfill).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { 'X-Custom': 'value1', 'X-Another': 'value2' },
      }),
    );
  });

  it('handler calls route.continue when removeHeaders is provided without body', async () => {
    const c = ctx();
    const mockRoute = makeMockRoute();
    let capturedHandler: ((route: unknown) => Promise<void>) | null = null;
    c.page.route = vi
      .fn()
      .mockImplementation((_pattern: string, handler: (route: unknown) => Promise<void>) => {
        capturedHandler = handler;
      });

    await browser_route(c, { pattern: '**/*', removeHeaders: 'Cookie, User-Agent' });

    await capturedHandler!(mockRoute);

    expect(mockRoute.continue).toHaveBeenCalledWith({
      headers: { 'content-type': 'application/json' },
    });
    expect(mockRoute.fulfill).not.toHaveBeenCalled();
  });

  it('handler calls route.continue when neither body nor removeHeaders', async () => {
    const c = ctx();
    const mockRoute = makeMockRoute();
    let capturedHandler: ((route: unknown) => Promise<void>) | null = null;
    c.page.route = vi
      .fn()
      .mockImplementation((_pattern: string, handler: (route: unknown) => Promise<void>) => {
        capturedHandler = handler;
      });

    await browser_route(c, { pattern: '**/*' });

    await capturedHandler!(mockRoute);

    expect(mockRoute.continue).toHaveBeenCalledWith();
    expect(mockRoute.fulfill).not.toHaveBeenCalled();
  });

  it('returns success and url', async () => {
    const c = ctx();
    const result = await browser_route(c, { pattern: '**/api/*', status: 200 });
    expect(result).toEqual({ success: true, url: URL });
  });
});

describe('browser_route_list', () => {
  it('returns empty list when no routes', async () => {
    const c = ctx();
    const result = await browser_route_list(c, {});
    expect(result.routes).toEqual([]);
    expect(result.url).toBe(URL);
  });

  it('returns list of configured routes', async () => {
    const c = ctx();
    c.routes.set('**/api/*', { pattern: '**/api/*', status: 201 });
    c.routes.set('**/*.png', { pattern: '**/*.png', status: 404 });
    c.routes.set('**/*', { pattern: '**/*', removeHeaders: 'Cookie' });

    const result = await browser_route_list(c, {});
    const routes = result.routes as Array<{ pattern: string; status: number }>;
    expect(routes).toHaveLength(3);
    expect(routes[0]).toEqual({ pattern: '**/api/*', status: 201 });
    expect(routes[1]).toEqual({ pattern: '**/*.png', status: 404 });
    expect(routes[2]).toEqual({ pattern: '**/*', status: 200 });
  });
});

describe('browser_unroute', () => {
  it('removes specific route by pattern', async () => {
    const c = ctx();
    c.routes.set('**/api/*', { pattern: '**/api/*' });
    c.routes.set('**/*.png', { pattern: '**/*.png' });

    const result = await browser_unroute(c, { pattern: '**/api/*' });

    expect(c.page.unroute).toHaveBeenCalledWith('**/api/*');
    expect(c.routes.has('**/api/*')).toBe(false);
    expect(c.routes.has('**/*.png')).toBe(true);
    expect(result).toEqual({ success: true, url: URL });
  });

  it('removes all routes when no pattern', async () => {
    const c = ctx();
    c.routes.set('**/api/*', { pattern: '**/api/*' });
    c.routes.set('**/*.png', { pattern: '**/*.png' });

    const result = await browser_unroute(c, {});

    expect(c.page.unrouteAll).toHaveBeenCalled();
    expect(c.routes.size).toBe(0);
    expect(result).toEqual({ success: true, url: URL });
  });

  it('does nothing when pattern not found', async () => {
    const c = ctx();
    const result = await browser_unroute(c, { pattern: '**/nonexistent' });
    expect(c.page.unroute).toHaveBeenCalledWith('**/nonexistent');
    expect(result).toEqual({ success: true, url: URL });
  });
});

describe('browser_network_state_set', () => {
  it('sets offline when state is offline', async () => {
    const c = ctx();
    const result = await browser_network_state_set(c, { state: 'offline' });
    expect(c.context.setOffline).toHaveBeenCalledWith(true);
    expect(result).toEqual({ success: true, state: 'offline', url: URL });
  });

  it('sets online when state is online', async () => {
    const c = ctx();
    const result = await browser_network_state_set(c, { state: 'online' });
    expect(c.context.setOffline).toHaveBeenCalledWith(false);
    expect(result).toEqual({ success: true, state: 'online', url: URL });
  });

  it('throws if state is missing', async () => {
    await expect(browser_network_state_set(ctx(), {} as never)).rejects.toThrow('"state"');
  });

  it('throws if state is invalid', async () => {
    await expect(browser_network_state_set(ctx(), { state: 'airplane' })).rejects.toThrow(
      'Invalid network state',
    );
  });
});
