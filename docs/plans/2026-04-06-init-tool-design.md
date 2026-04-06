# Init Tool Design

## Summary
Add a Page MCP Plugin private convention for a reserved tool named `init`. When a matching `init` tool is discovered for the current page, the plugin runs it silently once after capability discovery completes. The `init` tool is never exposed to the AI tool catalog and never appears as a normal user-invokable tool.

## Goals
- Support a lightweight page initialization hook without changing the MCP protocol.
- Keep `init` execution fully internal to the plugin.
- Let repositories bind page-level quick interactions or DOM enhancements at page load time.
- Choose the most specific `init` entry when multiple path-scoped definitions exist.

## Non-Goals
- Adding a new first-class MCP capability type such as `hooks` or `init`.
- Showing `init` execution in chat history, tool cards, or quick actions.
- Passing AI context or chat state into `init`.
- Expanding the first version beyond the current remote-tool execution model.

## Approved Behavior
- A tool with `name === "init"` is treated as a reserved plugin extension.
- After content-side MCP discovery finishes, the plugin selects the best matching `init` tool for the current `location.pathname` and executes it once.
- Execution is silent: no chat message, no visible status, no user confirmation prompt.
- Failures are swallowed and logged with `console.warn`.
- `init` is excluded from the execution catalog sent to the AI.
- The convention is protocol-level compatible with native and remote tools, but the first implementation targets remote tools as the primary supported path.

## Selection Rules
- Candidate set: all discovered tools whose name is exactly `init`.
- Filter candidates by `path` matching against `location.pathname`.
- A missing `path` counts as a global match with the lowest priority.
- Invalid `path` regex values are ignored and logged with `console.warn`.
- If multiple candidates match, choose the most specific one using this order:
- Valid explicit `path` beats missing `path`.
- Longer `path` strings beat shorter ones.
- Paths with more non-wildcard characters beat less specific patterns.
- Remaining ties fall back to discovery order.

## Lifecycle And Idempotency
- `init` runs after the content script has assembled the effective tool list for the page.
- Execution is limited to once per page key.
- The page key is `location.origin + location.pathname`.
- Query string and hash changes do not trigger another run.
- A pathname change that causes capability rediscovery may trigger a new `init` execution for the new page key.
- Re-renders, conversation changes, or settings updates must not rerun `init` for the same page key.

## Architecture
- Add a content-side selector utility to locate the best matching `init` tool from the discovered tool list.
- Add a small init runner that executes the selected tool outside the AI conversation flow.
- Update execution-catalog building so reserved `init` tools are filtered out before OpenAI tool definitions are created.
- Keep the implementation local to content runtime; no MCP schema migration is required.

## Data Flow
1. Discovery returns native and remote tools as it does today.
2. Content runtime derives the effective tool list for the current page.
3. The init selector finds the best matching `init` candidate for the page path.
4. If the page key has not already run, the runtime executes the selected `init` tool directly.
5. Normal tool catalog construction excludes all `init` entries before sending tools to the model.

## Error Handling
- Invalid `path` patterns are skipped.
- Missing or empty remote `execute` strings cause the `init` tool to be skipped.
- Execution failures do not affect widget rendering or chat behavior.
- All failures remain non-blocking and log through `console.warn`.

## Testing
- Add unit coverage for `init` selection priority and invalid-path handling.
- Add execution-catalog coverage proving `init` is filtered from AI-visible tools.
- Add content-runtime coverage for:
- auto-run after discovery
- once-per-page-key behavior
- silent failure handling
- preference for the most specific matching path

## Risks
- Auto-running page code increases the impact of buggy repository scripts, so keeping execution silent and one-shot is important.
- Path specificity is heuristic because repository paths are regex strings; tests must lock down the ranking behavior.
- If native `init` support is later enabled end-to-end, the reserved-name behavior must stay consistent with the remote implementation.
