---
name: pwbrouser-debug
description: Debug web applications using the pwbrouser headful browser CLI. Navigate pages, inspect console errors, examine network requests, interact with UI elements, and capture ARIA snapshots or screenshots — all from the terminal. Use when debugging browser-based issues, investigating frontend errors, testing webapp behavior, or when user mentions web debugging, console errors, network failures, or browser inspection.
---

# pwbrouser Debug

## Quick start

```bash
pwbrouser server start
pwbrouser navigate https://your-app.example.com
pwbrouser snapshot && pwbrouser console error && pwbrouser network
pwbrouser server stop
```

Always verify the server is running first: `pwbrouser server status` (shows PID, port, current page URL).

## Debugging workflows

### JS console errors

```bash
pwbrouser navigate https://your-app.example.com
pwbrouser console error       # errors only
pwbrouser console warning     # warnings + errors
pwbrouser console info        # all except debug
```

Messages accumulate since last navigation. Reproduce the bug, then check the console.

### Network / API failures

```bash
pwbrouser network             # non-static requests (xhr, fetch, document)
pwbrouser network /api/       # filter by URL regex
pwbrouser network_req 3       # full request + response bodies
pwbrouser network_req 5 response  # response body only
```

Look for 4xx/5xx status codes, unexpected response bodies. Drill into specific requests with `network_req <index>`.

### UI / layout issues

```bash
pwbrouser snapshot                # ARIA tree with [ref=eNN] markers
pwbrouser screenshot ./debug.png  # save to file
pwbrouser resize 375 812          # mobile viewport
```

### Form submission bugs

```bash
pwbrouser fill textbox "Email" "test@example.com"
pwbrouser fill textbox "Password" "secret123"
pwbrouser select combobox "Country" "Spain"
pwbrouser click button "Submit"
pwbrouser console error
pwbrouser network /submit
```

For complex forms, use snapshot refs with `--json` (see [REFERENCE.md](REFERENCE.md)).
For `<select>` dropdowns: `pwbrouser select <role> <name> <value>...`

### Page load / navigation issues

```bash
pwbrouser navigate https://your-app.example.com
pwbrouser wait_for text "Dashboard"     # wait for content
pwbrouser wait_for textGone "Loading..." # wait for spinner
pwbrouser back                          # test back-button behavior
pwbrouser snapshot && pwbrouser console error
```

### Keyboard / accessibility issues

```bash
pwbrouser press_key Tab                 # simulate Tab navigation
pwbrouser press_key Enter               # trigger form submission
pwbrouser press_key Control+A           # keyboard shortcuts
pwbrouser press_key ArrowDown           # navigation keys
```

Use with `snapshot` before and after to verify focus changes.

### Auth & session debugging

```bash
# Cookies
pwbrouser cookies                             # list all cookies
pwbrouser cookie set token "abc123"           # set a cookie
pwbrouser cookie get token                    # read a cookie value
pwbrouser cookie delete token                 # delete a cookie
pwbrouser cookie clear                        # clear all cookies

# localStorage
pwbrouser localstorage                        # list all items
pwbrouser localstorage get authToken          # read a value
pwbrouser localstorage set theme "dark"       # set a value
pwbrouser localstorage delete unusedKey       # remove a key
pwbrouser localstorage clear                  # clear all

# sessionStorage (same pattern)
pwbrouser sessionstorage
pwbrouser sessionstorage get sessionId

# Full state save/restore for reproducible debugging
pwbrouser storage_state ./debug-session.json  # save
pwbrouser set_state ./debug-session.json       # restore
```

### Offline / network state debugging

```bash
pwbrouser network_state offline          # go offline
pwbrouser navigate https://your-app.example.com
pwbrouser console error                  # check for service worker errors
pwbrouser network_state online           # go back online
```

### Multi-tab debugging

```bash
pwbrouser tabs list                      # list all open tabs
pwbrouser tabs new https://example.com   # open a new tab
pwbrouser tabs select 1                  # switch to tab index 1
pwbrouser tabs close 0                   # close tab index 0
```

Tabs share the same context (cookies, storage). Use this to debug cross-tab state synchronization.

### API mocking

```bash
pwbrouser route "**/api/users" 200 '[]'  # mock API with empty array
pwbrouser route "**/api/status" 500       # simulate server error
pwbrouser route_list                      # list active mocks
pwbrouser unroute "**/api/users"          # remove a specific mock
pwbrouser unroute                         # remove all mocks
```

### Drag-and-drop / file upload debugging

```bash
# drag between elements (use snapshot refs)
pwbrouser --json '{"method":"browser_drag","params":{"startTarget":{"ref":"e3"},"endTarget":{"ref":"e7"}}}'

# upload files
pwbrouser --json '{"method":"browser_file_upload","params":{"paths":["/path/to/file.pdf"]}}'
```

## Element targeting

Three ways to reference elements:

```bash
pwbrouser click button "Login"                              # role + name
pwbrouser --json '{"method":"browser_click","params":{"target":{"ref":"e15"}}}'   # snapshot ref
pwbrouser --json '{"method":"browser_click","params":{"target":{"selector":"button.primary"}}}' # CSS
```

Dialog handling: `pwbrouser dialog accept [promptText]` or `pwbrouser dialog dismiss`.

## Iterative debugging loop

1. Navigate → `pwbrouser navigate <url>`
2. Inspect → `pwbrouser snapshot` + `pwbrouser console error` + `pwbrouser network`
3. Interact → `pwbrouser click` / `pwbrouser fill` / `pwbrouser type`
4. Verify → `pwbrouser snapshot` + `pwbrouser network`
5. Repeat from step 3

## Reference

- [REFERENCE.md](REFERENCE.md) — full command reference
- [EXAMPLES.md](EXAMPLES.md) — real-world debugging scenarios
