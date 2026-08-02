import { describe, expect, it, vi } from 'vitest';
import type { MethodContext } from '../src/core.js';
import {
  browser_click,
  browser_close,
  browser_drag,
  browser_file_upload,
  browser_fill,
  browser_fill_form,
  browser_handle_dialog,
  browser_hover,
  browser_navigate,
  browser_navigate_back,
  browser_press_key,
  browser_resize,
  browser_select_option,
  browser_type,
  browser_wait_for,
} from '../src/core.js';

const SNAPSHOT = '- heading "Page" [ref=e1]';
const URL = 'https://example.com/';

function makePage() {
  return {
    ariaSnapshot: vi.fn().mockResolvedValue(SNAPSHOT),
    url: vi.fn().mockReturnValue(URL),
    goto: vi.fn().mockResolvedValue(undefined),
    goBack: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    setViewportSize: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue(undefined),
    keyboard: { press: vi.fn().mockResolvedValue(undefined) },
    locator: vi.fn().mockReturnValue({ __refLocator: true }),
    getByRole: vi.fn().mockReturnValue({
      first: vi.fn().mockReturnValue({
        click: vi.fn().mockResolvedValue(undefined),
        dblclick: vi.fn().mockResolvedValue(undefined),
        hover: vi.fn().mockResolvedValue(undefined),
        dragTo: vi.fn().mockResolvedValue(undefined),
        pressSequentially: vi.fn().mockResolvedValue(undefined),
        fill: vi.fn().mockResolvedValue(undefined),
        selectOption: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  } as unknown as MethodContext['page'];
}

function makeContext() {
  return { newPage: vi.fn() } as unknown as MethodContext['context'];
}

function ctx(overrides: Partial<MethodContext> = {}): MethodContext {
  const c: MethodContext = { page: makePage(), context: makeContext() };
  if (overrides.page && 'ariaSnapshot' in overrides.page) {
    c.page = overrides.page as MethodContext['page'];
  } else {
    Object.assign(c.page, overrides.page);
  }
  if (overrides.context) Object.assign(c.context, overrides.context);
  return c;
}

describe('browser_navigate', () => {
  it('navigates to URL and returns snapshot', async () => {
    const c = ctx();
    const result = await browser_navigate(c, { url: 'https://example.com' });
    expect(c.page.goto).toHaveBeenCalledWith('https://example.com', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    expect(result).toEqual({ snapshot: SNAPSHOT, url: URL });
  });

  it('throws if url is missing', async () => {
    await expect(browser_navigate(ctx(), {} as never)).rejects.toThrow('"url" parameter');
  });
});

describe('browser_click', () => {
  it('clicks element by ref and returns snapshot', async () => {
    const c = ctx();
    const clickFn = vi.fn().mockResolvedValue(undefined);
    const locatorMock = { click: clickFn, dblclick: vi.fn() };
    c.page.locator = vi.fn().mockReturnValue(locatorMock);

    const result = await browser_click(c, { target: { ref: 'e2' } });
    expect(c.page.locator).toHaveBeenCalledWith('[data-ref="e2"]');
    expect(clickFn).toHaveBeenCalledWith({ button: 'left', modifiers: [], timeout: 5000 });
    expect(result).toEqual({ snapshot: SNAPSHOT, url: URL });
  });

  it('double-clicks when doubleClick is true', async () => {
    const c = ctx();
    const dblclickFn = vi.fn().mockResolvedValue(undefined);
    c.page.getByRole = vi.fn().mockReturnValue({
      first: vi.fn().mockReturnValue({ click: vi.fn(), dblclick: dblclickFn }),
    });

    await browser_click(c, { target: { role: 'button' }, doubleClick: true });
    expect(dblclickFn).toHaveBeenCalledWith({ button: 'left', modifiers: [], timeout: 5000 });
  });

  it('passes button and modifiers to click', async () => {
    const c = ctx();
    const clickFn = vi.fn().mockResolvedValue(undefined);
    c.page.getByRole = vi.fn().mockReturnValue({
      first: vi.fn().mockReturnValue({ click: clickFn, dblclick: vi.fn() }),
    });

    await browser_click(c, { target: { role: 'button' }, button: 'right', modifiers: ['Control'] });
    expect(clickFn).toHaveBeenCalledWith({
      button: 'right',
      modifiers: ['Control'],
      timeout: 5000,
    });
  });

  it('throws if target is missing', async () => {
    await expect(browser_click(ctx(), {} as never)).rejects.toThrow('"target" parameter');
  });
});

describe('browser_hover', () => {
  it('hovers over element and returns snapshot', async () => {
    const c = ctx();
    const hoverFn = vi.fn().mockResolvedValue(undefined);
    c.page.getByRole = vi.fn().mockReturnValue({
      first: vi.fn().mockReturnValue({ hover: hoverFn }),
    });

    const result = await browser_hover(c, { target: { role: 'link' } });
    expect(hoverFn).toHaveBeenCalledWith({ timeout: 5000 });
    expect(result).toEqual({ snapshot: SNAPSHOT, url: URL });
  });

  it('throws if target is missing', async () => {
    await expect(browser_hover(ctx(), {} as never)).rejects.toThrow('"target" parameter');
  });
});

describe('browser_drag', () => {
  it('drags from start to end and returns snapshot', async () => {
    const c = ctx();
    const dragToFn = vi.fn().mockResolvedValue(undefined);
    const sourceLocator = { dragTo: dragToFn };
    const targetLocator = { __target: true };

    c.page.locator = vi.fn().mockReturnValueOnce(sourceLocator).mockReturnValueOnce(targetLocator);

    const result = await browser_drag(c, {
      startTarget: { ref: 'e1' },
      endTarget: { ref: 'e2' },
    });
    expect(dragToFn).toHaveBeenCalledWith(targetLocator, { timeout: 5000 });
    expect(result).toEqual({ snapshot: SNAPSHOT, url: URL });
  });

  it('throws if startTarget is missing', async () => {
    await expect(browser_drag(ctx(), { endTarget: { ref: 'e2' } } as never)).rejects.toThrow(
      '"startTarget"',
    );
  });

  it('throws if endTarget is missing', async () => {
    await expect(browser_drag(ctx(), { startTarget: { ref: 'e1' } } as never)).rejects.toThrow(
      '"endTarget"',
    );
  });
});

describe('browser_type', () => {
  it('fills instantly when neither submit nor slowly', async () => {
    const c = ctx();
    const fillFn = vi.fn().mockResolvedValue(undefined);
    c.page.getByRole = vi.fn().mockReturnValue({
      first: vi.fn().mockReturnValue({ fill: fillFn, pressSequentially: vi.fn() }),
    });

    await browser_type(c, { target: { role: 'textbox' }, text: 'hello' });
    expect(fillFn).toHaveBeenCalledWith('hello', { timeout: 5000 });
    expect(c.page.keyboard.press).not.toHaveBeenCalled();
  });

  it('types slowly with pressSequentially', async () => {
    const c = ctx();
    const pressFn = vi.fn().mockResolvedValue(undefined);
    c.page.getByRole = vi.fn().mockReturnValue({
      first: vi.fn().mockReturnValue({ fill: vi.fn(), pressSequentially: pressFn }),
    });

    await browser_type(c, { target: { role: 'textbox' }, text: 'hello', slowly: true });
    expect(pressFn).toHaveBeenCalledWith('hello', { delay: 50, timeout: 5000 });
  });

  it('presses Enter after typing when submit is true', async () => {
    const c = ctx();
    const pressFn = vi.fn().mockResolvedValue(undefined);
    c.page.getByRole = vi.fn().mockReturnValue({
      first: vi.fn().mockReturnValue({ fill: vi.fn(), pressSequentially: pressFn }),
    });

    await browser_type(c, { target: { role: 'textbox' }, text: 'hello', submit: true });
    expect(pressFn).toHaveBeenCalledWith('hello', { delay: undefined, timeout: 5000 });
    expect(c.page.keyboard.press).toHaveBeenCalledWith('Enter');
  });

  it('throws if target is missing', async () => {
    await expect(browser_type(ctx(), { text: 'hello' } as never)).rejects.toThrow('"target"');
  });

  it('throws if text is missing', async () => {
    await expect(browser_type(ctx(), { target: { ref: 'e1' } } as never)).rejects.toThrow('"text"');
  });
});

describe('browser_fill', () => {
  it('fills input and returns snapshot', async () => {
    const c = ctx();
    const fillFn = vi.fn().mockResolvedValue(undefined);
    c.page.locator = vi.fn().mockReturnValue({ fill: fillFn });

    const result = await browser_fill(c, { target: { ref: 'e1' }, value: 'test@example.com' });
    expect(fillFn).toHaveBeenCalledWith('test@example.com', { timeout: 5000 });
    expect(result).toEqual({ snapshot: SNAPSHOT, url: URL });
  });

  it('throws if target is missing', async () => {
    await expect(browser_fill(ctx(), { value: 'x' } as never)).rejects.toThrow('"target"');
  });

  it('throws if value is missing', async () => {
    await expect(browser_fill(ctx(), { target: { ref: 'e1' } } as never)).rejects.toThrow(
      '"value"',
    );
  });
});

describe('browser_fill_form', () => {
  it('fills multiple fields and returns snapshot', async () => {
    const c = ctx();
    const fillFn = vi.fn().mockResolvedValue(undefined);
    c.page.locator = vi.fn().mockReturnValue({ fill: fillFn });

    await browser_fill_form(c, {
      fields: [
        { target: { ref: 'e1' }, value: 'hello@example.com' },
        { target: { ref: 'e2' }, value: 'mypassword' },
      ],
    });
    expect(fillFn).toHaveBeenCalledTimes(2);
    expect(fillFn).toHaveBeenNthCalledWith(1, 'hello@example.com', { timeout: 5000 });
    expect(fillFn).toHaveBeenNthCalledWith(2, 'mypassword', { timeout: 5000 });
  });

  it('throws if fields is empty', async () => {
    await expect(browser_fill_form(ctx(), { fields: [] })).rejects.toThrow('"fields"');
  });

  it('throws if fields is missing', async () => {
    await expect(browser_fill_form(ctx(), {} as never)).rejects.toThrow('"fields"');
  });
});

describe('browser_select_option', () => {
  it('selects options and returns snapshot', async () => {
    const c = ctx();
    const selectFn = vi.fn().mockResolvedValue(undefined);
    c.page.locator = vi.fn().mockReturnValue({ selectOption: selectFn });

    await browser_select_option(c, {
      target: { ref: 'e1' },
      values: ['option1', 'option2'],
    });
    expect(selectFn).toHaveBeenCalledWith(['option1', 'option2'], { timeout: 5000 });
  });

  it('throws if target is missing', async () => {
    await expect(browser_select_option(ctx(), { values: ['x'] } as never)).rejects.toThrow(
      '"target"',
    );
  });

  it('throws if values is empty', async () => {
    await expect(
      browser_select_option(ctx(), { target: { ref: 'e1' }, values: [] }),
    ).rejects.toThrow('"values"');
  });
});

describe('browser_press_key', () => {
  it('presses a key and returns snapshot', async () => {
    const c = ctx();
    const result = await browser_press_key(c, { key: 'Enter' });
    expect(c.page.keyboard.press).toHaveBeenCalledWith('Enter');
    expect(result).toEqual({ snapshot: SNAPSHOT, url: URL });
  });

  it('throws if key is missing', async () => {
    await expect(browser_press_key(ctx(), {} as never)).rejects.toThrow('"key"');
  });
});

describe('browser_resize', () => {
  it('resizes viewport and returns snapshot', async () => {
    const c = ctx();
    const result = await browser_resize(c, { width: 800, height: 600 });
    expect(c.page.setViewportSize).toHaveBeenCalledWith({ width: 800, height: 600 });
    expect(result).toEqual({ snapshot: SNAPSHOT, url: URL });
  });

  it('throws if width is invalid', async () => {
    await expect(browser_resize(ctx(), { width: 0, height: 600 })).rejects.toThrow('"width"');
  });

  it('throws if height is invalid', async () => {
    await expect(browser_resize(ctx(), { width: 800, height: -1 })).rejects.toThrow('"height"');
  });

  it('throws if width is not a number', async () => {
    await expect(browser_resize(ctx(), { width: 'abc', height: 600 } as never)).rejects.toThrow(
      '"width"',
    );
  });
});

describe('browser_wait_for', () => {
  it('waits for time and returns snapshot', async () => {
    const c = ctx();
    await browser_wait_for(c, { time: 3 });
    expect(c.page.waitForTimeout).toHaveBeenCalledWith(3000);
  });

  it('waits for text to appear', async () => {
    const c = ctx();
    await browser_wait_for(c, { text: 'Welcome' });
    expect(c.page.waitForSelector).toHaveBeenCalledWith('text=Welcome', { timeout: 5000 });
  });

  it('waits for text to disappear', async () => {
    const c = ctx();
    await browser_wait_for(c, { textGone: 'Loading...' });
    expect(c.page.waitForSelector).toHaveBeenCalledWith('text=Loading...', {
      state: 'detached',
      timeout: 5000,
    });
  });

  it('throws if no condition is provided', async () => {
    await expect(browser_wait_for(ctx(), {} as never)).rejects.toThrow('exactly one');
  });

  it('throws if multiple conditions are provided', async () => {
    await expect(browser_wait_for(ctx(), { time: 2, text: 'x' })).rejects.toThrow('exactly one');
  });
});

describe('browser_close', () => {
  it('closes current page, opens new one, returns snapshot', async () => {
    const originalClose = vi.fn().mockResolvedValue(undefined);
    const newPage = {
      ariaSnapshot: vi.fn().mockResolvedValue('- heading "New" [ref=e1]'),
      url: vi.fn().mockReturnValue('about:blank'),
    };
    const page = makePage();
    page.close = originalClose;

    const c = ctx({
      page: page as never,
      context: { newPage: vi.fn().mockResolvedValue(newPage) } as never,
    });

    const result = await browser_close(c, {});
    expect(originalClose).toHaveBeenCalled();
    expect(c.context.newPage).toHaveBeenCalled();
    expect(result).toEqual({ snapshot: '- heading "New" [ref=e1]', url: 'about:blank' });
    expect(c.page).toBe(newPage);
  });
});

describe('browser_navigate_back', () => {
  it('goes back and returns snapshot', async () => {
    const c = ctx();
    const result = await browser_navigate_back(c, {});
    expect(c.page.goBack).toHaveBeenCalledWith({ waitUntil: 'networkidle', timeout: 60000 });
    expect(result).toEqual({ snapshot: SNAPSHOT, url: URL });
  });
});

describe('browser_handle_dialog', () => {
  it('accepts pending dialog', async () => {
    const acceptFn = vi.fn().mockResolvedValue(undefined);
    const dismissFn = vi.fn().mockResolvedValue(undefined);
    const ctxObj = {
      page: makePage(),
      context: makeContext() as never,
      pendingDialog: { accept: acceptFn, dismiss: dismissFn },
    };

    await browser_handle_dialog(ctxObj as never, { accept: true });
    expect(acceptFn).toHaveBeenCalledWith(undefined);
    expect(dismissFn).not.toHaveBeenCalled();
  });

  it('dismisses pending dialog when accept is false', async () => {
    const acceptFn = vi.fn().mockResolvedValue(undefined);
    const dismissFn = vi.fn().mockResolvedValue(undefined);
    const ctxObj = {
      page: makePage(),
      context: makeContext() as never,
      pendingDialog: { accept: acceptFn, dismiss: dismissFn },
    };

    await browser_handle_dialog(ctxObj as never, { accept: false });
    expect(dismissFn).toHaveBeenCalled();
    expect(acceptFn).not.toHaveBeenCalled();
  });

  it('passes promptText to accept', async () => {
    const acceptFn = vi.fn().mockResolvedValue(undefined);
    const ctxObj = {
      page: makePage(),
      context: makeContext() as never,
      pendingDialog: { accept: acceptFn, dismiss: vi.fn() },
    };

    await browser_handle_dialog(ctxObj as never, { accept: true, promptText: 'Hello' });
    expect(acceptFn).toHaveBeenCalledWith('Hello');
  });

  it('does nothing if no pending dialog', async () => {
    const ctxObj = { page: makePage(), context: makeContext() as never, pendingDialog: null };
    const result = await browser_handle_dialog(ctxObj as never, { accept: true });
    expect(result).toEqual({ snapshot: SNAPSHOT, url: URL });
  });
});

describe('browser_file_upload', () => {
  it('uploads files via pending file chooser', async () => {
    const setFilesFn = vi.fn().mockResolvedValue(undefined);
    const ctxObj = {
      page: makePage(),
      context: makeContext() as never,
      pendingFileChooser: { setFiles: setFilesFn },
    };

    await browser_file_upload(ctxObj as never, { paths: ['/tmp/file.txt'] });
    expect(setFilesFn).toHaveBeenCalledWith(['/tmp/file.txt']);
  });

  it('does nothing if no pending file chooser', async () => {
    const ctxObj = {
      page: makePage(),
      context: makeContext() as never,
      pendingFileChooser: null,
    };
    const result = await browser_file_upload(ctxObj as never, { paths: ['/tmp/file.txt'] });
    expect(result).toEqual({ snapshot: SNAPSHOT, url: URL });
  });

  it('does nothing if paths is empty', async () => {
    const setFilesFn = vi.fn();
    const ctxObj = {
      page: makePage(),
      context: makeContext() as never,
      pendingFileChooser: { setFiles: setFilesFn },
    };

    await browser_file_upload(ctxObj as never, { paths: [] });
    expect(setFilesFn).not.toHaveBeenCalled();
  });
});
