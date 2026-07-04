# pwbrouser

Playwright browser automation CLI tool — control a headful Chromium browser over HTTP.

## Install

```bash
npm i -g pwbrouser
```

## Quick start

```bash
# Start the browser daemon
pwbrouser server start

# Navigate and interact
pwbrouser navigate https://example.com
pwbrouser click button "More information"
pwbrouser snapshot

# Stop when done
pwbrouser server stop
```

## Commands

### Server management

| Command | Description |
|---------|-------------|
| `pwbrouser server start [--port PORT]` | Start the browser daemon (default port: 9999) |
| `pwbrouser server stop` | Stop the daemon |
| `pwbrouser server status` | Show daemon status, port, and current page |

### Navigation

| Command | Description |
|---------|-------------|
| `pwbrouser navigate <url>` | Navigate to a URL |
| `pwbrouser back` | Go back in history |
| `pwbrouser close` | Close current page (opens new blank page) |

### Tabs

| Command | Description |
|---------|-------------|
| `pwbrouser tabs list` | List all open tabs |
| `pwbrouser tabs new [url]` | Open a new tab |
| `pwbrouser tabs close [index]` | Close tab (current if no index) |
| `pwbrouser tabs select <index>` | Switch to tab by index |

### Interaction

| Command | Description |
|---------|-------------|
| `pwbrouser click <role> <name>` | Click an element |
| `pwbrouser dblclick <role> <name>` | Double-click an element |
| `pwbrouser hover <role> <name>` | Hover over an element |
| `pwbrouser type <role> <name> <text>` | Type text into an element |
| `pwbrouser fill <role> <name> <value>` | Fill an input instantly |
| `pwbrouser press_key <key>` | Press a keyboard key (e.g. `Enter`, `Control+A`) |
| `pwbrouser resize <width> <height>` | Resize the viewport |
| `pwbrouser select <role> <name> <value>...` | Select dropdown options |
| `pwbrouser dialog accept [promptText]` | Accept a browser dialog |
| `pwbrouser dialog dismiss` | Dismiss a browser dialog |

### Waiting

| Command | Description |
|---------|-------------|
| `pwbrouser wait_for time <seconds>` | Wait for a duration |
| `pwbrouser wait_for text <text>` | Wait for text to appear |
| `pwbrouser wait_for textGone <text>` | Wait for text to disappear |

### Storage

| Command | Description |
|---------|-------------|
| `pwbrouser cookies [domain]` | List all cookies (optional domain filter) |
| `pwbrouser cookie get <name>` | Get a cookie by name |
| `pwbrouser cookie set <name> <value>` | Set a cookie |
| `pwbrouser cookie delete <name>` | Delete a cookie by name |
| `pwbrouser cookie clear` | Clear all cookies |
| `pwbrouser localstorage` | List all localStorage items |
| `pwbrouser localstorage get <key>` | Get a localStorage value |
| `pwbrouser localstorage set <key> <value>` | Set a localStorage value |
| `pwbrouser localstorage delete <key>` | Delete a localStorage item |
| `pwbrouser localstorage clear` | Clear all localStorage |
| `pwbrouser sessionstorage` | List all sessionStorage items |
| `pwbrouser sessionstorage get <key>` | Get a sessionStorage value |
| `pwbrouser sessionstorage set <key> <value>` | Set a sessionStorage value |
| `pwbrouser sessionstorage delete <key>` | Delete a sessionStorage item |
| `pwbrouser sessionstorage clear` | Clear all sessionStorage |
| `pwbrouser storage_state [filename]` | Save storage state (to file if provided) |
| `pwbrouser set_state <filename>` | Restore storage state from file |

### Inspection

| Command | Description |
|---------|-------------|
| `pwbrouser snapshot` | Capture ARIA accessibility snapshot |
| `pwbrouser screenshot [path]` | Take a screenshot |
| `pwbrouser console [level]` | Show console messages (debug/info/warning/error) |
| `pwbrouser network [filter]` | List network requests |
| `pwbrouser network_req <index> [part]` | Show network request details |

### Network Mocking

| Command | Description |
|---------|-------------|
| `pwbrouser route <pattern> [status] [body]` | Mock requests matching a URL glob pattern |
| `pwbrouser route_list` | List all active mocked routes |
| `pwbrouser unroute [pattern]` | Remove route(s) (all if no pattern) |
| `pwbrouser network_state <online\|offline>` | Set browser network online or offline |

For complex route configurations (content type, extra headers, etc.), use JSON mode:
```bash
pwbrouser --json '{"method":"browser_route","params":{"pattern":"**/api/*","status":201,"body":"{\"ok\":true}","contentType":"application/json","headers":["X-Custom: value"]}}'
```

### Raw JSON

```bash
pwbrouser --json '{"method":"browser_navigate","params":{"url":"https://example.com"}}'
```

## How it works

```
CLI client ──POST /execute { method, params }──→ HTTP server (daemon)
                                                      │
                                                      ▼
                                              Playwright + Chromium
```

- The daemon maintains **one browser, one context, one active page**
- After every mutating action, the response includes a full ARIA snapshot with `[ref=eNN]` markers
- Elements are referenced by snapshot ref (`e15`), role+name, or CSS selector
- Read-only methods (snapshot, screenshot, console, network) return their data without side effects

## API

The daemon exposes a single HTTP endpoint:

### `POST /execute`

```json
// Request
{ "method": "browser_navigate", "params": { "url": "https://example.com" } }

// Response (success)
{ "result": { "snapshot": "- heading \"Example\" ...", "url": "https://example.com/" } }

// Response (error)
{ "error": { "message": "page.goto: net::ERR_NAME_NOT_RESOLVED", "snapshot": "..." } }
```

All 42 methods from `playwright_wrapper.md` are implemented. See the spec for details.

## Development

```bash
pnpm install
pnpm dev         # Start server in dev mode (tsx)
pnpm build       # Compile TypeScript
pnpm test        # Run tests (vitest)
pnpm typecheck   # Type-check only
pnpm lint        # Biome lint
pnpm format      # Biome format
```

## License

ISC
