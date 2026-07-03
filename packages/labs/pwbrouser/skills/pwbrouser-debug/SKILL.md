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

Always verify the server is running first: `pwbrouser server status`.

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
pwbrouser click button "Submit"
pwbrouser console error
pwbrouser network /submit
```

For complex forms, use snapshot refs with `--json` (see [REFERENCE.md](REFERENCE.md)).

### Page load / navigation issues

```bash
pwbrouser navigate https://your-app.example.com
pwbrouser wait_for text "Dashboard"     # wait for content
pwbrouser wait_for textGone "Loading..." # wait for spinner
pwbrouser snapshot && pwbrouser console error
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
