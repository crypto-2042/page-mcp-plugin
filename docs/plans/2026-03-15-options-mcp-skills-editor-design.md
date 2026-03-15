# Options MCP/Skills Editor Refactor Design

## Summary
Refactor the MCP/Skills editor page to separate tools, prompts, and resources editing logic while keeping the existing modal workflow. Each type gets dedicated form handling to match its data structure and improve maintainability.

## Goals
- Preserve the current modal-based editing UX.
- Separate per-type fields and validation logic.
- Reduce cross-type branching and shared mutable state.
- Keep repository save payloads unchanged.

## Non-Goals
- UI redesign beyond the modal content changes.
- Changing storage schema or backend API shape.

## Architecture
The page remains a single editor with three lists. Modal invocation stays the same, but modal contents are type-specific and driven by type-specific form models. Conversion between UI form state and stored MCP snapshot is handled per type.

## Components
- **Type-specific form models:** `ToolForm`, `PromptForm`, `ResourceForm`.
- **Modal content components:** `ToolEditorFields`, `PromptEditorFields`, `ResourceEditorFields` embedded in the existing modal shell.
- **Typed save handlers:** replace the current shared save logic with per-type update functions.

## Data Flow
1. Lists render from `form.tools`, `form.prompts`, `form.resources`.
2. Edit or add opens modal for the chosen type and loads the corresponding form.
3. Save updates only that list; no cross-list manipulation.
4. Repository payload remains constructed via `buildRepositoryPayloadFromForm`.

## Error Handling
- Validation rules apply per type (e.g., resources require `uri`/`mimeType`, prompts require `messages`).
- Empty rows are ignored unless the user entered any field content.

## Testing
- Update `mcp-skills-form.test.ts` with per-type parsing/serialization coverage.
- Add lightweight unit tests around type-specific validators if needed.
