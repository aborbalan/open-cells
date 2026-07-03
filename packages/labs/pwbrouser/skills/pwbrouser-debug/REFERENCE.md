# pwbrouser Command Reference

## Server management

| Command | Description |
|---------|-------------|
| `pwbrouser server start [--port PORT]` | Start the browser daemon (default port 9999) |
| `pwbrouser server stop` | Stop the daemon |
| `pwbrouser server status` | Show PID, port, and current page URL |

## Navigation

| Command | Description |
|---------|-------------|
| `pwbrouser navigate <url>` | Navigate to URL, waits for network idle |
| `pwbrouser back` | Go back in history |
| `pwbrouser close` | Close current page, opens new blank page |

## Interaction

| Command | Description |
|---------|-------------|
| `pwbrouser click <role> <name>` | Click element by role + accessible name |
| `pwbrouser dblclick <role> <name>` | Double-click element |
| `pwbrouser hover <role> <name>` | Hover over element |
| `pwbrouser type <role> <name> <text>` | Type text character-by-character into element |
| `pwbrouser fill <role> <name> <value>` | Fill input instantly (replaces content) |
| `pwbrouser press_key <key>` | Press a key (e.g. `Enter`, `Tab`, `Control+A`, `ArrowDown`) |
| `pwbrouser select <role> <name> <value>...` | Select option(s) in a `<select>` element |
| `pwbrouser resize <width> <height>` | Resize viewport |
| `pwbrouser dialog accept [promptText]` | Accept browser dialog |
| `pwbrouser dialog dismiss` | Dismiss browser dialog |

## Waiting

| Command | Description |
|---------|-------------|
| `pwbrouser wait_for time <seconds>` | Pause execution |
| `pwbrouser wait_for text <text>` | Wait for text to appear on page |
| `pwbrouser wait_for textGone <text>` | Wait for text to disappear |

## Inspection (read-only)

| Command | Description |
|---------|-------------|
| `pwbrouser snapshot` | ARIA accessibility snapshot with `[ref=eNN]` markers |
| `pwbrouser screenshot [path]` | Take screenshot (base64 if no path, PNG to file if path) |
| `pwbrouser console [level]` | Console messages. Levels: `debug`, `info`, `warning`, `error` (default: `info`) |
| `pwbrouser network [filter]` | List network requests. Optional regex filter on URL |
| `pwbrouser network_req <index> [part]` | Full request/response details by 1-based index. `part`: `request`, `response`, or omit for both |

## Raw JSON mode

Bypass the convenience CLI and send any method directly:

```bash
pwbrouser --json '{"method":"browser_navigate","params":{"url":"https://example.com"}}'
```

All methods support snapshot ref targeting via `--json`:

```bash
pwbrouser --json '{"method":"browser_click","params":{"target":{"ref":"e15"}}}'
pwbrouser --json '{"method":"browser_fill_form","params":{"fields":[{"target":{"ref":"e4"},"value":"test@test.com"}]}}'
```

## Response format

Every mutating action returns `{ snapshot, url }` — you always get the updated page state. Read-only actions return their specific data (e.g. `{ messages, url }` for console, `{ requests, url }` for network).

Errors return `{ message, snapshot? }` with the last known snapshot for re-orientation.
