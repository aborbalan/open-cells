# Playwright HTTP Wrapper — API Specification

Replicate the **Playwright MCP tool surface** over plain HTTP (POST `/execute`).  
No MCP protocol, no MCP client required. One endpoint, JSON in, JSON out.

---

## 1. Architecture

```
Agent / CLI client
    │ POST /execute  { method, params }
    ▼
HTTP server (server.ts)
    │ maps method → Playwright API call
    ▼
Playwright + Chromium
    │ returns page state
    ▼
Response  { result: { snapshot, url, ... } }
```

- The server maintains **one browser, one context, one page** (single-session model).
- After every **mutating** action, the response includes a full ARIA snapshot of the page.
- **Read-only** actions return their specific data (snapshot, screenshot, cookies, etc.) without side effects.
- Target elements are referenced by **ref** strings from the ARIA snapshot (e.g. `"e5"`), or by role+name, or by CSS/Playwright selectors.

---

## 2. Endpoint

### `POST /execute`

**Request:**

```json
{
  "method": "browser_navigate",
  "params": {
    "url": "https://example.com"
  }
}
```

**Response (success):**

```json
{
  "result": {
    "snapshot": "- heading \"Example Domain\" [level=1]\n- paragraph: ...",
    "url": "https://example.com/"
  }
}
```

**Response (error):**

```json
{
  "error": {
    "message": "page.goto: net::ERR_NAME_NOT_RESOLVED",
    "snapshot": "..."
  }
}
```

Mutating actions always return `snapshot` + `url`.  
Read-only actions return `url` + data specific to the method.  
Errors always include `message` and the last known `snapshot` if available.

---

## 3. Target Resolution

Elements can be referenced in three ways. The server tries them in order:

| Ref type         | Format                                 | Example                                                            |
| ---------------- | -------------------------------------- | ------------------------------------------------------------------ |
| **Snapshot ref** | `"ref": "e15"`                         | A generated `data-ref` attribute matching the ARIA tree node index |
| **Role + name**  | `"role": "button"`, `"name": "Search"` | Uses `page.getByRole(role, { name }).first()`                      |
| **Selector**     | `"selector": "button[type='submit']"`  | Raw Playwright selector (CSS, text, etc.)                          |

All methods that accept a `target` use this pattern:

```json
{
  "target": { "ref": "e15" }
}
// or
{
  "target": { "role": "button", "name": "Search" }
}
// or
{
  "target": { "selector": "button.submit" }
}
```

### snapshot ref generation

Every element in the ARIA snapshot must have a unique `data-ref` attribute so the agent can refer back to it:

```
- heading "Example" [level=1] [ref=e1]
  - button "Click me" [ref=e2]
  - textbox "Name" [ref=e3]
```

Implementation hint: Inject a script that assigns `data-ref` attributes before calling `page.ariaSnapshot()`, or post-process the ARIA snapshot string to insert refs (preferred — avoids page mutation).

---

## 4. Core Automation Methods

All methods below are **mutating** (return snapshot after execution).

### 4.1 `browser_navigate`

Navigate to a URL.

| Param | Type   | Required | Description                                                   |
| ----- | ------ | -------- | ------------------------------------------------------------- |
| `url` | string | yes      | The URL to navigate to (absolute, e.g. `https://example.com`) |

Playwright: `await page.goto(url, { waitUntil: 'networkidle' })`

Response: `{ snapshot, url }`

---

### 4.2 `browser_click`

Click an element.

| Param         | Type     | Required | Description                                                       |
| ------------- | -------- | -------- | ----------------------------------------------------------------- |
| `target`      | Target   | yes      | Element to click                                                  |
| `doubleClick` | boolean  | no       | Perform a double click (default: false)                           |
| `button`      | string   | no       | Mouse button: `"left"`, `"right"`, `"middle"` (default: `"left"`) |
| `modifiers`   | string[] | no       | Modifier keys: `["Control"]`, `["Shift"]`, etc.                   |

Playwright: `locator.click({ button, modifiers, ... })`  
If `doubleClick`: `locator.dblclick()`

---

### 4.3 `browser_hover`

Hover over an element.

| Param    | Type   | Required | Description      |
| -------- | ------ | -------- | ---------------- |
| `target` | Target | yes      | Element to hover |

Playwright: `locator.hover()`

---

### 4.4 `browser_drag`

Drag and drop between two elements.

| Param         | Type   | Required | Description         |
| ------------- | ------ | -------- | ------------------- |
| `startTarget` | Target | yes      | Source element      |
| `endTarget`   | Target | yes      | Destination element |

Playwright: `startLocator.dragTo(endLocator)`

---

### 4.5 `browser_type`

Type text into an editable element (character by character).

| Param    | Type    | Required | Description                                              |
| -------- | ------- | -------- | -------------------------------------------------------- |
| `target` | Target  | yes      | Element to type into                                     |
| `text`   | string  | yes      | Text to type                                             |
| `submit` | boolean | no       | Press Enter after typing (default: false)                |
| `slowly` | boolean | no       | Type with 50ms delay between characters (default: false) |

Playwright:

- If `submit`: `locator.pressSequentially(text, { delay })` then `page.keyboard.press('Enter')`
- If not submit: `locator.fill(text)` (fast) or `locator.pressSequentially(text, { delay })` (slowly)

---

### 4.6 `browser_fill`

Fill an input field (instant, replaces content). Shorthand for `browser_type` without `submit`/`slowly`.

| Param    | Type   | Required | Description   |
| -------- | ------ | -------- | ------------- |
| `target` | Target | yes      | Input element |
| `value`  | string | yes      | Value to fill |

Playwright: `locator.fill(value)`

---

### 4.7 `browser_fill_form`

Fill multiple form fields at once (atomic, faster).

| Param    | Type    | Required | Description                |
| -------- | ------- | -------- | -------------------------- |
| `fields` | Field[] | yes      | Array of field descriptors |

Field:

```json
{
  "target": { "ref": "e4" },
  "value": "hello@example.com"
}
```

Playwright: Iterate fields, `locator.fill(value)` for each. Only one snapshot + wait for the whole batch.

---

### 4.8 `browser_select_option`

Select option(s) in a `<select>` dropdown.

| Param    | Type     | Required | Description                                               |
| -------- | -------- | -------- | --------------------------------------------------------- |
| `target` | Target   | yes      | The `<select>` element                                    |
| `values` | string[] | yes      | Option values to select (can be value attr or label text) |

Playwright: `locator.selectOption(values)`

---

### 4.9 `browser_press_key`

Press a keyboard key or combination.

| Param | Type   | Required | Description                                              |
| ----- | ------ | -------- | -------------------------------------------------------- |
| `key` | string | yes      | Key name: `"Enter"`, `"ArrowDown"`, `"Control+A"`, `"a"` |

Playwright: `page.keyboard.press(key)`

---

### 4.10 `browser_resize`

Resize the browser viewport.

| Param    | Type   | Required | Description               |
| -------- | ------ | -------- | ------------------------- |
| `width`  | number | yes      | Viewport width in pixels  |
| `height` | number | yes      | Viewport height in pixels |

Playwright: `await page.setViewportSize({ width, height })`

---

### 4.11 `browser_wait_for`

Wait for a condition.

| Param      | Type   | Required | Description                                   |
| ---------- | ------ | -------- | --------------------------------------------- |
| `time`     | number | no       | Wait this many seconds                        |
| `text`     | string | no       | Wait for this text to appear on the page      |
| `textGone` | string | no       | Wait for this text to disappear from the page |

Exactly one of `time`, `text`, `textGone` must be provided.

Playwright:

- `time`: `await page.waitForTimeout(time * 1000)`
- `text`: `await page.waitForSelector(`text=${text}`)`
- `textGone`: `await page.waitForSelector(`text=${textGone}`, { state: 'detached' })`

---

### 4.12 `browser_close`

Close the current page (opens a new blank page after).

Playwright: `await page.close()` then `page = await context.newPage()`

---

### 4.13 `browser_navigate_back`

Go back in browser history.

Playwright: `await page.goBack({ waitUntil: 'networkidle' })`

---

### 4.14 `browser_handle_dialog`

Accept or dismiss a browser dialog (alert, confirm, prompt).

| Param        | Type    | Required | Description                          |
| ------------ | ------- | -------- | ------------------------------------ |
| `accept`     | boolean | yes      | `true` to accept, `false` to dismiss |
| `promptText` | string  | no       | Text to enter for prompt dialogs     |

Playwright: Set up dialog handler with `page.on('dialog', ...)` before the triggering action, or handle the currently open dialog.

Implementation note: Since dialogs are modal, the server should listen for dialog events and resolve them:

```ts
page.once('dialog', async dialog => {
  if (accept) {
    await dialog.accept(promptText);
  } else {
    await dialog.dismiss();
  }
});
```

---

### 4.15 `browser_file_upload`

Upload files via a file input.

| Param   | Type     | Required | Description                                                              |
| ------- | -------- | -------- | ------------------------------------------------------------------------ |
| `paths` | string[] | no       | Absolute file paths to upload. Omit or empty to cancel the file chooser. |

Playwright: `await page.getByRole('button', { name: 'Select file' }).click()` → `await fileChooser.setFiles(paths)`

Implementation note: Use `page.waitForEvent('filechooser')` before clicking the file input, then `fileChooser.setFiles(paths)`.

---

## 5. Read-Only Methods

These do **not** mutate page state. They return their specific data.

### 5.1 `browser_snapshot`

Capture the ARIA accessibility snapshot of the current page.

| Param    | Type   | Required | Description                                            |
| -------- | ------ | -------- | ------------------------------------------------------ |
| `target` | Target | no       | If provided, snapshot only this element's subtree      |
| `depth`  | number | no       | Limit snapshot tree depth (e.g. `3` for 3 levels deep) |

Response: `{ snapshot, url }`

If `target` is a selector or role+name: snapshot that locator only.

Playwright:

- Full page: `await page.ariaSnapshot({ ref: true })`
- Element: `await locator.ariaSnapshot({ ref: true })`

Note: `{ ref: true }` generates `[ref=eNN]` markers automatically (Playwright 1.50+). If unavailable, post-process the snapshot string to inject refs.

---

### 5.2 `browser_take_screenshot`

Take a screenshot.

| Param      | Type    | Required | Description                                          |
| ---------- | ------- | -------- | ---------------------------------------------------- |
| `target`   | Target  | no       | Element to screenshot. If omitted, full page.        |
| `type`     | string  | no       | `"png"` or `"jpeg"` (default: `"png"`)               |
| `fullPage` | boolean | no       | Capture full scrollable page (default: false)        |
| `filename` | string  | no       | Save to file. If omitted, return base64 in response. |
| `scale`    | string  | no       | `"css"` or `"device"` pixel ratio (default: `"css"`) |

Response:

- If `filename`: `{ screenshot: "/path/to/file.png", url }`
- If no filename: `{ screenshot: "base64...", url }`

Playwright: `await page.screenshot(...)` or `await locator.screenshot(...)`

---

### 5.3 `browser_console_messages`

Get browser console messages.

| Param   | Type    | Required | Description                                                                                                          |
| ------- | ------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `level` | string  | no       | Filter level: `"error"`, `"warning"`, `"info"`, `"debug"`. Each level includes more severe levels. Default: `"info"` |
| `all`   | boolean | no       | Return all messages since session start. Default: since last navigation.                                             |

Response: `{ messages: [{ type: "error", text: "..." }], url }`

Implementation: Accumulate messages in an array via `page.on('console', msg => messages.push(...))`. Clear on navigation unless `all: true`.

---

### 5.4 `browser_network_requests`

List network requests since loading the page.

| Param    | Type    | Required | Description                                                        |
| -------- | ------- | -------- | ------------------------------------------------------------------ |
| `static` | boolean | no       | Include static resources (images, fonts, scripts). Default: false. |
| `filter` | string  | no       | Regex filter on URL (e.g. `"/api/.*user"`)                         |

Response: `{ requests: [{ index: 1, url: "...", method: "GET", status: 200, type: "xhr" }], url }`

Implementation: Accumulate via `page.on('request', ...)` and `page.on('response', ...)`. Clear on navigation.

---

### 5.5 `browser_network_request`

Get full details (headers + body) of a single network request.

| Param   | Type   | Required | Description                                   |
| ------- | ------ | -------- | --------------------------------------------- |
| `index` | number | yes      | 1-based index from `browser_network_requests` |
| `part`  | string | no       | `"request"` or `"response"`. Omit for both.   |

Response: `{ request: { url, method, headers, body }, response: { status, headers, body }, url }`

---

## 6. Tab Management

### 6.1 `browser_tabs`

Manage browser tabs/pages.

| Param    | Type   | Required | Description                                              |
| -------- | ------ | -------- | -------------------------------------------------------- |
| `action` | string | yes      | `"list"`, `"new"`, `"close"`, `"select"`                 |
| `index`  | number | no       | Tab index for close/select. Omit close to close current. |
| `url`    | string | no       | URL for new tab.                                         |

Playwright: `context.pages()` for list, `context.newPage()` for new, `page.close()` for close, switch `page` reference for select.

Response (list): `{ tabs: [{ index: 0, url: "https://...", title: "..." }], url }`  
Response (new/select/close): `{ snapshot, url }`

---

## 7. Storage Methods

All storage methods operate on the current browser context.

### 7.1 Cookies

| Method                  | Params                                                                                         | Playwright                     |
| ----------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------ |
| `browser_cookie_list`   | `domain?`, `path?`                                                                             | `context.cookies(urls?)`       |
| `browser_cookie_get`    | `name` (string)                                                                                | Filter from list               |
| `browser_cookie_set`    | `name`, `value`, `domain?`, `path?`, `expires?` (unix ts), `httpOnly?`, `secure?`, `sameSite?` | `context.addCookies([cookie])` |
| `browser_cookie_delete` | `name` (string)                                                                                | Clear+re-set all except this   |
| `browser_cookie_clear`  | —                                                                                              | `context.clearCookies()`       |

Response: `{ cookies: [...], url }` (for list/get), `{ success: true, url }` (for set/delete/clear)

### 7.2 LocalStorage & SessionStorage

All follow the same pattern. Operates via `page.evaluate()` inside the page.

| Method suffix | Params                   |
| ------------- | ------------------------ |
| `_list`       | —                        |
| `_get`        | `key` (string)           |
| `_set`        | `key`, `value` (strings) |
| `_delete`     | `key` (string)           |
| `_clear`      | —                        |

Full method names:

- `browser_localstorage_list` / `_get` / `_set` / `_delete` / `_clear`
- `browser_sessionstorage_list` / `_get` / `_set` / `_delete` / `_clear`

Implementation: `await page.evaluate(({ store, action, key, value }) => { ... }, { store: 'localStorage', ... })`

Response: `{ data: [...] }` (list), `{ value: "..." }` (get), `{ success: true }` (set/delete/clear)

---

### 7.3 Storage State

| Method                      | Params               | Playwright                                                                     |
| --------------------------- | -------------------- | ------------------------------------------------------------------------------ |
| `browser_storage_state`     | `filename?` (string) | `context.storageState()` → write to file if filename                           |
| `browser_set_storage_state` | `filename` (string)  | Read file → `context.addCookies(cookies)` + `page.evaluate()` for localStorage |

---

## 8. Network Mocking

### 8.1 `browser_route`

Mock network requests matching a URL pattern.

| Param           | Type     | Required | Description                                                  |
| --------------- | -------- | -------- | ------------------------------------------------------------ |
| `pattern`       | string   | yes      | URL glob pattern (e.g. `"**/api/users"`, `"**/*.{png,jpg}"`) |
| `status`        | number   | no       | HTTP status code (default: 200)                              |
| `body`          | string   | no       | Response body (string or JSON string)                        |
| `contentType`   | string   | no       | Content-Type header (e.g. `"application/json"`)              |
| `headers`       | string[] | no       | Extra headers in `"Name: Value"` format                      |
| `removeHeaders` | string   | no       | Comma-separated header names to remove from request          |

Playwright: `await page.route(pattern, async (route) => { await route.fulfill({ ... }) })`

Store routes in a Map so `browser_route_list` and `browser_unroute` work.

---

### 8.2 `browser_route_list`

List all active mocked routes.

Response: `{ routes: [{ pattern: "**/api/*", status: 200 }], url }`

---

### 8.3 `browser_unroute`

Remove mocked routes.

| Param     | Type   | Required | Description                                 |
| --------- | ------ | -------- | ------------------------------------------- |
| `pattern` | string | no       | URL pattern to unroute. Omit to remove all. |

Playwright: `await page.unroute(pattern)` or `await page.unrouteAll()`

---

### 8.4 `browser_network_state_set`

Set browser network state to online or offline.

| Param   | Type   | Required | Description               |
| ------- | ------ | -------- | ------------------------- |
| `state` | string | yes      | `"online"` or `"offline"` |

Playwright: `await context.setOffline(state === 'offline')`

---

## 9. Advanced Methods

### 9.1 `browser_evaluate`

Evaluate JavaScript on the page or an element.

| Param      | Type   | Required | Description                                                             |
| ---------- | ------ | -------- | ----------------------------------------------------------------------- |
| `target`   | Target | no       | Element to scope the function to. If omitted, runs on page.             |
| `function` | string | yes      | JavaScript function: `() => document.title` or `(el) => el.textContent` |
| `filename` | string | no       | Save result to file. If omitted, return in response.                    |

Playwright:

- No target: `await page.evaluate(func)`
- With target: `await locator.evaluate(func)`

Response: `{ result: <serialized>, url }`

Security: This is **not sandboxed** — the function runs with full page privileges. The MCP tool calls this `browser_run_code_unsafe` for a reason. Expose only if you trust the agent.

---

### 9.2 `browser_run_code_unsafe`

Run arbitrary Playwright code (RCE-equivalent — use with caution).

| Param      | Type   | Required | Description                                                                                                                                |
| ---------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `code`     | string | yes      | JS function receiving `page`: `async (page) => { await page.getByRole('button', { name: 'Submit' }).click(); return await page.title(); }` |
| `filename` | string | no       | Load code from file instead                                                                                                                |

Playwright: `eval(code)(page)` — the code string is a function body, called with the page object.

---

### 9.3 `browser_drop`

Drop files or MIME-typed data onto an element (simulating external drag-in).

| Param    | Type                  | Required | Description                                      |
| -------- | --------------------- | -------- | ------------------------------------------------ |
| `target` | Target                | yes      | Drop target element                              |
| `paths`  | string[]              | no       | Absolute file paths to drop                      |
| `data`   | Record<string,string> | no       | MIME-typed data (e.g. `{"text/plain": "hello"}`) |

At least one of `paths` or `data` must be provided.

Playwright: Use `page.evaluate()` with `DataTransfer` API, or `page.dispatchEvent()` with custom DragEvent.

---

## 10. PDF Generation

### 10.1 `browser_pdf_save`

Save current page as PDF.

| Param      | Type   | Required | Description                                       |
| ---------- | ------ | -------- | ------------------------------------------------- |
| `filename` | string | no       | Output filename (default: `page-{timestamp}.pdf`) |

Playwright: `await page.pdf({ path: filename })`

Note: Only works in headless Chromium.

---

## 11. Response Schema (summary)

### Mutating actions → `{ result: { snapshot, url } }`

```typescript
interface MutatingResult {
  snapshot: string; // ARIA snapshot with [ref=eNN] markers
  url: string; // Current page URL
}
```

### Read-only actions → `{ result: { ...methodSpecific, url } }`

```typescript
interface SnapshotResult {
  snapshot: string;
  url: string;
}

interface ScreenshotResult {
  screenshot: string; // base64 or file path
  url: string;
}

interface CookiesResult {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: string;
  }>;
  url: string;
}

interface NetworkRequestsResult {
  requests: Array<{
    index: number;
    url: string;
    method: string;
    status: number;
    statusText: string;
    type: string; // "xhr", "fetch", "document", "script", etc.
  }>;
  url: string;
}

interface ConsoleMessagesResult {
  messages: Array<{
    type: 'log' | 'error' | 'warning' | 'info' | 'debug';
    text: string;
    location?: string;
    timestamp: number;
  }>;
  url: string;
}

interface TabsResult {
  tabs: Array<{
    index: number;
    url: string;
    title: string;
  }>;
  url: string;
}

interface StorageResult {
  data: Record<string, string> | Array<{ key: string; value: string }>;
  url: string;
}
```

### All errors → `{ error: { message, snapshot? } }`

```typescript
interface ErrorResult {
  message: string;
  snapshot?: string; // last known ARIA snapshot, if available
}
```

---

## 12. Server State

The server maintains:

```typescript
interface ServerState {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  pages: Page[]; // All open tabs
  routes: Map<string, RouteHandler>; // Active mocked routes
  consoleMessages: ConsoleMessage[];
  networkRequests: NetworkRequest[];
  pendingDialogHandler: DialogHandler | null;
}
```

- `consoleMessages` and `networkRequests` are cleared on each `browser_navigate`.
- `routes` persist across navigations.
- `pages` array tracks tabs; `page` is the currently active tab.

---

## 13. Implementation Order (Priority)

Start with the core loop, then expand:

| Phase             | Methods                                                                                      | Why                       |
| ----------------- | -------------------------------------------------------------------------------------------- | ------------------------- |
| **1. Foundation** | `navigate`, `snapshot`, `click`, `type`, `hover`, `press_key`, `resize`, `wait_for`, `close` | 80% of agent workflows    |
| **2. Forms**      | `fill_form`, `select_option`, `drag`, `drop`, `handle_dialog`, `file_upload`                 | Remaining UI interactions |
| **3. Inspection** | `take_screenshot`, `console_messages`, `network_requests`, `network_request`                 | Debugging                 |
| **4. Tabs**       | `tabs` (list/new/close/select), `navigate_back`                                              | Multi-page flows          |
| **5. Storage**    | All cookie + storage methods, `storage_state` / `set_storage_state`                          | Auth & persistence        |
| **6. Network**    | `route`, `route_list`, `unroute`, `network_state_set`                                        | Mocking & offline testing |
| **7. Advanced**   | `evaluate`, `run_code_unsafe`                                                                | Escape hatches            |
| **8. Extras**     | `pdf_save`                                                                                   | Reports                   |

---

## 14. Snapshot Format

The ARIA snapshot must include `[ref=eNN]` markers on every element. Example:

```
- heading "Welcome" [level=1] [ref=e1]
  - navigation [ref=e2]
    - link "Home" [ref=e3]
    - link "About" [ref=e4]
  - main [ref=e5]
    - button "Submit" [disabled] [ref=e6]
    - combobox "Country" [ref=e7]
      - option "Spain" [selected] [ref=e8]
      - option "France" [ref=e9]
```

`ref` values are stable within a single snapshot. They **do not** persist across navigations.

Implementation: If Playwright's `{ ref: true }` option is available (v1.50+), use it. Otherwise, inject data attributes via `page.evaluate()` before calling `ariaSnapshot()`, or post-process the snapshot string with a regex to assign sequential refs.

---

## 15. CLI Client (browser.ts)

The CLI client is a thin convenience wrapper. It accepts a method name and an optional JSON params object:

```bash
# Simple actions (positional args)
tsx browser.ts navigate "https://example.com"
tsx browser.ts click button "Search"
tsx browser.ts type textbox "Email" "hello@test.com"
tsx browser.ts press_key "Enter"
tsx browser.ts resize 1280 720
tsx browser.ts wait_for text "Welcome"
tsx browser.ts snapshot

# Complex actions (JSON params)
tsx browser.ts --json '{"method":"browser_fill_form","params":{"fields":[{"target":{"ref":"e4"},"value":"test@test.com"}]}}'
tsx browser.ts --json '{"method":"browser_cookie_set","params":{"name":"token","value":"abc123"}}'
```

The `--json` mode passes the payload directly to the server. Positional args mode maps to the convenience format already implemented.

---

## 16. Design Decisions

1. **Single-session model**: One browser, one context, one active page. Multi-tab support via `browser_tabs` but tabs share the same context (cookies, storage).

2. **Snapshot on every mutation**: Agents need to see the result of every action. No separate `snapshot` call needed after clicks/fills/typing.

3. **No session persistence by default**: Browser state is in-memory only. Add `--storage-state` CLI flag later to save/restore.

4. **Timeouts**:

   - Action timeout: 5000ms
   - Navigation timeout: 60000ms
   - Configurable via server startup args.

5. **Error recovery**: If a mutation fails, the server returns the last known snapshot. The agent can re-orient and retry.

6. **No screenshot by default**: ARIA snapshots are token-efficient. Screenshots only on explicit request (`browser_take_screenshot`).

7. **HTTP only**: No WebSocket, no MCP, no SSE. Simple POST/JSON. Any HTTP client works — curl, fetch, or the CLI wrapper.
