import type { BrowserContext, Page } from "playwright";
import { captureSnapshot } from "./snapshot.js";
import { resolveTarget } from "./target.js";
import type { Field, MutatingResult, Target } from "./types.js";

export interface MethodContext {
  page: Page;
  context: BrowserContext;
}

function snap(ctx: MethodContext): Promise<MutatingResult> {
  return captureSnapshot(ctx.page).then((snapshot) => ({
    snapshot,
    url: ctx.page.url(),
  }));
}

export async function browser_navigate(ctx: MethodContext, params: Record<string, unknown>): Promise<MutatingResult> {
  const url = params.url as string;
  if (!url) throw new Error('browser_navigate requires "url" parameter');
  await ctx.page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  return snap(ctx);
}

export async function browser_click(ctx: MethodContext, params: Record<string, unknown>): Promise<MutatingResult> {
  const target = params.target as Target | undefined;
  if (!target) throw new Error('browser_click requires "target" parameter');
  const locator = resolveTarget(ctx.page, target);
  const doubleClick = params.doubleClick as boolean | undefined;
  const button = (params.button as string) || "left";
  const modifiers = (params.modifiers as string[]) ?? [];

  if (doubleClick) {
    await locator.dblclick({ button: button as never, modifiers: modifiers as never, timeout: 5000 });
  } else {
    await locator.click({ button: button as never, modifiers: modifiers as never, timeout: 5000 });
  }

  return snap(ctx);
}

export async function browser_hover(ctx: MethodContext, params: Record<string, unknown>): Promise<MutatingResult> {
  const target = params.target as Target | undefined;
  if (!target) throw new Error('browser_hover requires "target" parameter');
  const locator = resolveTarget(ctx.page, target);
  await locator.hover({ timeout: 5000 });
  return snap(ctx);
}

export async function browser_drag(ctx: MethodContext, params: Record<string, unknown>): Promise<MutatingResult> {
  const startTarget = params.startTarget as Target | undefined;
  const endTarget = params.endTarget as Target | undefined;
  if (!startTarget) throw new Error('browser_drag requires "startTarget" parameter');
  if (!endTarget) throw new Error('browser_drag requires "endTarget" parameter');
  const startLocator = resolveTarget(ctx.page, startTarget);
  const endLocator = resolveTarget(ctx.page, endTarget);
  await startLocator.dragTo(endLocator, { timeout: 5000 });
  return snap(ctx);
}

export async function browser_type(ctx: MethodContext, params: Record<string, unknown>): Promise<MutatingResult> {
  const target = params.target as Target | undefined;
  const text = params.text as string;
  if (!target) throw new Error('browser_type requires "target" parameter');
  if (text === undefined || text === null) throw new Error('browser_type requires "text" parameter');
  const submit = params.submit as boolean | undefined;
  const slowly = params.slowly as boolean | undefined;
  const locator = resolveTarget(ctx.page, target);
  const delay = slowly ? 50 : undefined;

  if (submit) {
    await locator.pressSequentially(text, { delay, timeout: 5000 });
    await ctx.page.keyboard.press("Enter");
  } else if (slowly) {
    await locator.pressSequentially(text, { delay, timeout: 5000 });
  } else {
    await locator.fill(text, { timeout: 5000 });
  }

  return snap(ctx);
}

export async function browser_fill(ctx: MethodContext, params: Record<string, unknown>): Promise<MutatingResult> {
  const target = params.target as Target | undefined;
  const value = params.value as string;
  if (!target) throw new Error('browser_fill requires "target" parameter');
  if (value === undefined || value === null) throw new Error('browser_fill requires "value" parameter');
  const locator = resolveTarget(ctx.page, target);
  await locator.fill(value, { timeout: 5000 });
  return snap(ctx);
}

export async function browser_fill_form(ctx: MethodContext, params: Record<string, unknown>): Promise<MutatingResult> {
  const fields = params.fields as Field[] | undefined;
  if (!fields || !Array.isArray(fields) || fields.length === 0) {
    throw new Error('browser_fill_form requires a non-empty "fields" array');
  }
  for (const field of fields) {
    const locator = resolveTarget(ctx.page, field.target);
    await locator.fill(field.value, { timeout: 5000 });
  }
  return snap(ctx);
}

export async function browser_select_option(
  ctx: MethodContext,
  params: Record<string, unknown>,
): Promise<MutatingResult> {
  const target = params.target as Target | undefined;
  const values = params.values as string[] | undefined;
  if (!target) throw new Error('browser_select_option requires "target" parameter');
  if (!values || !Array.isArray(values) || values.length === 0) {
    throw new Error('browser_select_option requires a non-empty "values" array');
  }
  const locator = resolveTarget(ctx.page, target);
  await locator.selectOption(values, { timeout: 5000 });
  return snap(ctx);
}

export async function browser_press_key(ctx: MethodContext, params: Record<string, unknown>): Promise<MutatingResult> {
  const key = params.key as string;
  if (!key) throw new Error('browser_press_key requires "key" parameter');
  await ctx.page.keyboard.press(key);
  return snap(ctx);
}

export async function browser_resize(ctx: MethodContext, params: Record<string, unknown>): Promise<MutatingResult> {
  const width = Number(params.width);
  const height = Number(params.height);
  if (Number.isNaN(width) || width <= 0) throw new Error('browser_resize requires a valid "width" parameter');
  if (Number.isNaN(height) || height <= 0) throw new Error('browser_resize requires a valid "height" parameter');
  await ctx.page.setViewportSize({ width, height });
  return snap(ctx);
}

export async function browser_wait_for(ctx: MethodContext, params: Record<string, unknown>): Promise<MutatingResult> {
  const time = params.time as number | undefined;
  const text = params.text as string | undefined;
  const textGone = params.textGone as string | undefined;

  const provided = [time !== undefined, text !== undefined, textGone !== undefined].filter(Boolean).length;
  if (provided !== 1) throw new Error("browser_wait_for requires exactly one of: time, text, textGone");

  if (time !== undefined) {
    await ctx.page.waitForTimeout(time * 1000);
  } else if (text !== undefined) {
    await ctx.page.waitForSelector(`text=${text}`, { timeout: 5000 });
  } else if (textGone !== undefined) {
    await ctx.page.waitForSelector(`text=${textGone}`, { state: "detached", timeout: 5000 });
  }

  return snap(ctx);
}

export async function browser_close(ctx: MethodContext, _params: Record<string, unknown>): Promise<MutatingResult> {
  await ctx.page.close();
  ctx.page = await ctx.context.newPage();
  return snap(ctx);
}

export async function browser_navigate_back(
  ctx: MethodContext,
  _params: Record<string, unknown>,
): Promise<MutatingResult> {
  await ctx.page.goBack({ waitUntil: "networkidle", timeout: 60000 });
  return snap(ctx);
}

export async function browser_handle_dialog(
  ctx: MethodContext,
  params: Record<string, unknown>,
): Promise<MutatingResult> {
  const accept = params.accept !== false;
  const promptText = params.promptText as string | undefined;

  const dialog = (
    ctx as unknown as { pendingDialog?: { accept: (text?: string) => Promise<void>; dismiss: () => Promise<void> } }
  ).pendingDialog;
  if (dialog) {
    if (accept) {
      await dialog.accept(promptText);
    } else {
      await dialog.dismiss();
    }
    (ctx as unknown as { pendingDialog: unknown }).pendingDialog = null;
  }

  return snap(ctx);
}

export async function browser_file_upload(
  ctx: MethodContext,
  params: Record<string, unknown>,
): Promise<MutatingResult> {
  const paths = params.paths as string[] | undefined;

  const fileChooser = (
    ctx as unknown as { pendingFileChooser?: { setFiles: (paths: string[]) => Promise<void> } | null }
  ).pendingFileChooser;
  if (fileChooser && paths && paths.length > 0) {
    await fileChooser.setFiles(paths);
  }
  (ctx as unknown as { pendingFileChooser: unknown }).pendingFileChooser = null;

  return snap(ctx);
}

export const coreMethods: Record<
  string,
  (ctx: MethodContext, params: Record<string, unknown>) => Promise<MutatingResult>
> = {
  browser_navigate,
  browser_click,
  browser_hover,
  browser_drag,
  browser_type,
  browser_fill,
  browser_fill_form,
  browser_select_option,
  browser_press_key,
  browser_resize,
  browser_wait_for,
  browser_close,
  browser_navigate_back,
  browser_handle_dialog,
  browser_file_upload,
};
