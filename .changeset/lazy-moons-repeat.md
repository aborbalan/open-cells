---
'@open-cells/mcp-server': patch
---

Move the command line out of the stdio entry point.

`parseArgs` and `USAGE` now live in `src/cli.ts`, covered at 100%. Behaviour is unchanged — the
same flags are accepted, unknown ones are still ignored — but the parsing no longer sits in a file
that cannot execute inside a test, where its branches went unasserted.
