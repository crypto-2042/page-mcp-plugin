# Remote Tool Confirmation Design

## Summary
Add a confirmation gate for remote repository tool execution only. Users can opt-in to bypass confirmation on a per-repository basis via the MCP/Skills options UI.

## Goals
- Require user confirmation before executing remote tools.
- Allow per-repository opt-out for confirmations.
- Keep native MCP tool execution unchanged.

## Non-Goals
- Global confirmation toggle for all tools.
- Support legacy `snapshot.mcp` array shape.

## Architecture
Remote tools are identified by `sourceType === 'remote'` and `sourceRepositoryId`. The content-side execution pipeline checks a per-repo flag before allowing tool execution. Confirmation UI lives in the chat widget, while the allowlist setting lives in the Options MCP/Skills repository list.

## Components
- **Data model:** add `allowWithoutConfirm` to `InstalledRemoteRepository` and related storage.
- **Options UI:** add a per-repo toggle labeled "Allow direct execution".
- **Chat UI:** add a modal confirmation step for remote tool calls with tool name, repo label, and args summary.
- **Execution gate:** remote tool execution waits for confirmation unless the repo is allowlisted.

## Data Flow
1. `useMcpDiscovery` loads remote repos and merges tools with source metadata.
2. When a remote tool is invoked, the execution gate checks `allowWithoutConfirm` for the repo.
3. If confirmation required, a modal is shown; user chooses Allow or Cancel.
4. On Allow, execution proceeds in MAIN world; on Cancel, execution is aborted without error message.

## Error Handling
- User cancels: treat as a clean abort; no error message appended.
- Timeout or missing repo: default to requiring confirmation.
- Execution errors remain surfaced as tool errors.

## Testing
- Unit tests for the confirmation gate logic (allowlist vs confirm).
- Options form mapping tests for persisting `allowWithoutConfirm`.
- Manual test for chat modal flow and per-repo allowlist effect.
