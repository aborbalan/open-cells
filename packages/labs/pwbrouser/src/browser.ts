import http from "node:http";

const USAGE = `Usage:
  pwbrouser <action> [args...]
  pwbrouser --json '{"method":"browser_xxx","params":{...}}'

Actions:
  navigate <url>                    Navigate to URL
  click <role> <name>              Click element by role+name
  dblclick <role> <name>           Double-click element
  hover <role> <name>              Hover over element
  type <role> <name> <text>        Type text into element
  fill <role> <name> <value>       Fill input (instant)
  press_key <key>                  Press a keyboard key
  resize <width> <height>          Resize viewport
  wait_for time <seconds>          Wait for time
  wait_for text <text>             Wait for text to appear
  wait_for textGone <text>         Wait for text to disappear
  snapshot                         Capture ARIA snapshot
  screenshot [path]                Take screenshot
  select <role> <name> <val>       Select option in dropdown
  back                             Navigate back
  close                            Close page (opens new)
  dialog accept [promptText]       Accept dialog
  dialog dismiss                   Dismiss dialog
  console [level]                  Show console messages (debug/info/warning/error)
  network [filter]                 List network requests
  network_req <index> [part]       Show network request details
  route <pattern> [status] [body]  Mock network requests
  route_list                       List active mocked routes
  unroute [pattern]                Remove route(s) (all if no pattern)
  network_state <online|offline>   Set network online/offline
  tabs list                        List all open tabs
  tabs new [url]                   Open a new tab
  tabs close [index]               Close tab (current if no index)
  tabs select <index>              Switch to tab by index
  cookies [domain]                 List cookies (optional domain filter)
  cookie get <name>                Get a cookie by name
  cookie set <name> <value>        Set a cookie
  cookie delete <name>             Delete a cookie by name
  cookie clear                     Clear all cookies
  localstorage                     List localStorage items
  localstorage get <key>           Get a localStorage value
  localstorage set <key> <value>   Set a localStorage value
  localstorage delete <key>        Delete a localStorage item
  localstorage clear               Clear all localStorage
  sessionstorage                   List sessionStorage items
  sessionstorage get <key>         Get a sessionStorage value
  sessionstorage set <key> <value> Set a sessionStorage value
  sessionstorage delete <key>      Delete a sessionStorage item
  sessionstorage clear             Clear all sessionStorage
  storage_state [filename]         Save storage state (to file if provided)
  set_state <filename>             Restore storage state from file
  --json '<payload>'               Send raw { method, params } payload`;

interface ExecuteResponse {
  result?: unknown;
  error?: { message: string; snapshot?: string };
}

export function showClientHelp(): void {
  console.log(USAGE);
}

export function buildPayload(args: string[]): { method: string; params: Record<string, unknown> } {
  if (args[0] === "--json") {
    const raw = args.slice(1).join(" ");
    return JSON.parse(raw);
  }

  const [action, ...rest] = args;

  switch (action) {
    case "navigate":
      return { method: "browser_navigate", params: { url: rest[0] } };

    case "click":
      return { method: "browser_click", params: { target: { role: rest[0], name: rest[1] } } };

    case "dblclick":
      return { method: "browser_click", params: { target: { role: rest[0], name: rest[1] }, doubleClick: true } };

    case "hover":
      return { method: "browser_hover", params: { target: { role: rest[0], name: rest[1] } } };

    case "type":
      return { method: "browser_type", params: { target: { role: rest[0], name: rest[1] }, text: rest[2] } };

    case "fill":
      return { method: "browser_fill", params: { target: { role: rest[0], name: rest[1] }, value: rest[2] } };

    case "press_key":
      return { method: "browser_press_key", params: { key: rest[0] } };

    case "resize":
      return { method: "browser_resize", params: { width: Number(rest[0]), height: Number(rest[1]) } };

    case "wait_for":
      return { method: "browser_wait_for", params: { [rest[0]!]: rest[0] === "time" ? Number(rest[1]) : rest[1] } };

    case "snapshot":
      return { method: "browser_snapshot", params: {} };

    case "screenshot":
      return { method: "browser_take_screenshot", params: { filename: rest[0] } };

    case "select":
      return {
        method: "browser_select_option",
        params: { target: { role: rest[0], name: rest[1] }, values: rest.slice(2) },
      };

    case "back":
      return { method: "browser_navigate_back", params: {} };

    case "close":
      return { method: "browser_close", params: {} };

    case "dialog": {
      const sub = rest[0];
      if (sub === "accept") return { method: "browser_handle_dialog", params: { accept: true, promptText: rest[1] } };
      if (sub === "dismiss") return { method: "browser_handle_dialog", params: { accept: false } };
      throw new Error(`Unknown dialog action: ${sub}. Use accept or dismiss.`);
    }

    case "console":
      return { method: "browser_console_messages", params: { level: rest[0] || "info" } };

    case "network":
      return { method: "browser_network_requests", params: { filter: rest[0] } };

    case "network_req": {
      const part = rest[1] as string | undefined;
      return { method: "browser_network_request", params: { index: Number(rest[0]), part } };
    }

    case "route": {
      const p: Record<string, unknown> = { pattern: rest[0] };
      if (rest[1] !== undefined) p.status = Number(rest[1]);
      if (rest[2] !== undefined) p.body = rest[2];
      return { method: "browser_route", params: p };
    }

    case "route_list":
      return { method: "browser_route_list", params: {} };

    case "unroute":
      return { method: "browser_unroute", params: rest[0] ? { pattern: rest[0] } : {} };

    case "network_state":
      return { method: "browser_network_state_set", params: { state: rest[0] } };

    case "cookies":
      return { method: "browser_cookie_list", params: { domain: rest[0] } };

    case "cookie": {
      const sub = rest[0];
      if (sub === "get") return { method: "browser_cookie_get", params: { name: rest[1] } };
      if (sub === "set") return { method: "browser_cookie_set", params: { name: rest[1], value: rest[2] } };
      if (sub === "delete") return { method: "browser_cookie_delete", params: { name: rest[1] } };
      if (sub === "clear") return { method: "browser_cookie_clear", params: {} };
      throw new Error(`Unknown cookie action: ${sub}. Use get, set, delete, or clear.`);
    }

    case "localstorage": {
      const sub = rest[0];
      if (!sub || sub === "list") return { method: "browser_localstorage_list", params: {} };
      if (sub === "get") return { method: "browser_localstorage_get", params: { key: rest[1] } };
      if (sub === "set") return { method: "browser_localstorage_set", params: { key: rest[1], value: rest[2] } };
      if (sub === "delete") return { method: "browser_localstorage_delete", params: { key: rest[1] } };
      if (sub === "clear") return { method: "browser_localstorage_clear", params: {} };
      throw new Error(`Unknown localstorage action: ${sub}. Use get, set, delete, clear, or no subcommand for list.`);
    }

    case "sessionstorage": {
      const sub = rest[0];
      if (!sub || sub === "list") return { method: "browser_sessionstorage_list", params: {} };
      if (sub === "get") return { method: "browser_sessionstorage_get", params: { key: rest[1] } };
      if (sub === "set") return { method: "browser_sessionstorage_set", params: { key: rest[1], value: rest[2] } };
      if (sub === "delete") return { method: "browser_sessionstorage_delete", params: { key: rest[1] } };
      if (sub === "clear") return { method: "browser_sessionstorage_clear", params: {} };
      throw new Error(`Unknown sessionstorage action: ${sub}. Use get, set, delete, clear, or no subcommand for list.`);
    }

    case "storage_state":
      return { method: "browser_storage_state", params: { filename: rest[0] } };

    case "set_state":
      return { method: "browser_set_storage_state", params: { filename: rest[0] } };

    case "tabs": {
      const sub = rest[0];
      if (sub === "list") return { method: "browser_tabs", params: { action: "list" } };
      if (sub === "new") return { method: "browser_tabs", params: { action: "new", url: rest[1] } };
      if (sub === "close")
        return {
          method: "browser_tabs",
          params: { action: "close", index: rest[1] !== undefined ? Number(rest[1]) : undefined },
        };
      if (sub === "select") return { method: "browser_tabs", params: { action: "select", index: Number(rest[1]) } };
      throw new Error(`Unknown tabs action: ${sub}. Use list, new, close, or select.`);
    }

    default:
      throw new Error(`Unknown action: ${action}. Use --help for usage.`);
  }
}

export function sendRequest(payload: { method: string; params: Record<string, unknown> }, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);

    const options: http.RequestOptions = {
      hostname: "127.0.0.1",
      port,
      path: "/execute",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          const json = JSON.parse(data) as ExecuteResponse;

          if (json.error) {
            console.log("\n=== ERROR ===");
            console.log(json.error.message);
            if (json.error.snapshot) {
              console.log("\n=== LAST KNOWN SNAPSHOT ===");
              console.log(json.error.snapshot);
            }
          } else {
            console.log("\n=== RESULT ===");
            console.log(JSON.stringify(json.result, null, 2));
          }
          resolve();
        } catch {
          reject(new Error(`Error parsing server response: ${data}`));
        }
      });
    });

    req.on("error", () => {
      reject(new Error("Could not connect to browser daemon. Is the server running? Run: pwbrouser server start"));
    });

    req.write(body);
    req.end();
  });
}

export async function runClient(args: string[], port: number): Promise<void> {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    showClientHelp();
    return;
  }

  const payload = buildPayload(args);
  await sendRequest(payload, port);
}
