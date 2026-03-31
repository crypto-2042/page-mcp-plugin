# Selection Quote Chat Context Design

**Date:** 2026-03-31

**Goal:** Let users send selected page text into the chat as explicit context via the browser context menu, with a default one-shot quote that can be pinned to the current conversation.

## Summary

Add a new browser context menu item, `As Chat Resource`, for text selections. When clicked, the extension captures the selected text from the browser menu event, forwards it to the content script, opens the chat panel, and shows a single quote chip above the input.

The quote behaves as a separate concept from MCP resources:

- It is user-created, not page-provided.
- It defaults to one-shot use for the next send only.
- It can be pinned to the current conversation and then applied on every future turn until removed.

The first version supports exactly one quote at a time. A new selection replaces the existing displayed quote.

## Goals

- Support browser-native text selection flow: select text -> right click -> `As Chat Resource`
- Show the selected text as a visible quote chip above the chat input
- Use the quote as hidden model context when sending messages
- Default to one-shot behavior
- Allow the user to pin the quote for the current conversation
- Keep the quote model separate from existing MCP resources

## Non-Goals

- Multiple simultaneous quote chips
- Selection source metadata such as title, hostname, URL, or DOM anchor
- In-page floating action buttons near the selection
- Persisting one-shot quotes across reloads or across conversations
- Reusing MCP resource selection UI for selection quotes

## Product Behavior

### Entry Point

The extension registers a browser context menu item visible only when text is selected.

Menu label for v1:

- `As Chat Resource`

Clicking the menu item should:

1. Read `selectionText` from the browser context menu event
2. Ignore empty or whitespace-only selections
3. Send the text to the active tab content script
4. Open the chat panel if needed
5. Show the quote chip above the input

### Quote States

The UI exposes one visible quote chip, backed by two possible internal states:

- `draftQuote`: used for the next send only
- `pinnedQuote`: attached to the current conversation until removed

For v1, only one visible quote is shown at a time and a new selection replaces the current one.

State transitions:

- `empty -> draft`
- `draft -> empty` after send
- `draft -> pinned` when user clicks pin
- `pinned -> empty` when user closes the chip
- `pinned -> draft` when user adds a new selection quote

### Send Behavior

When the user sends a message:

- If `draftQuote` exists, inject it as hidden system context for this turn, then clear it
- If `pinnedQuote` exists, inject it as hidden system context for this turn and keep it
- If neither exists, no quote context is injected

The quote is not rendered as a normal transcript message. It becomes hidden system context, similar in spirit to the existing attached resource flow.

## UX

### Quote Chip

The quote chip appears above the input area and includes:

- truncated selected text
- a close action
- a pin action or pinned state indicator

The chip should stay visually lightweight and must not look like an MCP resource picker entry. The label should use language closer to "quote" or "selected text" rather than "resource" inside the chat panel, to avoid confusion with MCP resources.

### Truncation

- The chip preview is truncated for display
- The actual context payload is also capped to a safe maximum length before being injected

This avoids oversized prompts from very large selections while keeping the visible UI compact.

## Architecture

### Separation From MCP Resources

Selection quote context must not be represented as an MCP resource and must not be added to `attachedResourceUris`.

Reasons:

- user-selected text and page-provided MCP resources are different concepts
- the current MCP resource UI is scoped to resources discovered from hosts/repos
- keeping them separate reduces coupling and preserves room for future evolution

### Message Flow

1. `background` registers the browser context menu
2. User clicks `As Chat Resource`
3. `background` receives `selectionText`
4. `background` sends a runtime message to the active tab content script
5. `content` updates local quote state and opens the panel
6. On send, `content` converts quote state into hidden system messages
7. Existing chat runtime continues unchanged, receiving prepared conversation messages

### Persistence Model

- `draftQuote` is local UI state only
- `pinnedQuote` is stored on the current `Conversation`

Persisting `pinnedQuote` on `Conversation` keeps the behavior scoped to the conversation and aligned with existing conversation storage semantics.

Suggested shape:

```ts
type ConversationQuote = {
  text: string;
  createdAt: number;
};
```

Then extend `Conversation` with:

```ts
pinnedQuote?: ConversationQuote;
```

## Context Injection Format

Introduce a dedicated helper for selection quote context, analogous to the existing resource attachment helper.

Suggested hidden system message for one-shot quote:

```text
Selected page text for this conversation turn:

<quote text>
```

Suggested hidden system message for pinned quote:

```text
Pinned selected page text for this conversation:

<quote text>
```

The implementation can use one or two helpers internally, but the injected messages should stay stable and explicit.

## Error Handling

- Ignore blank selections
- If the content script is unavailable for the active tab, fail silently in v1
- If the panel is closed, open it automatically when a quote arrives
- If a generation is in progress and a new quote arrives, do not alter the in-flight request; apply the quote on the next send
- If the selected text is too long, truncate before prompt injection using a fixed safe limit

## Testing Strategy

### Background

- registers the context menu on startup/install
- forwards `selectionText` to the active tab when clicked
- ignores empty selections

### Content / UI

- receiving a selection quote opens the panel and displays the chip
- closing the chip clears the current quote state
- pinning converts a draft quote into a pinned conversation quote
- a new selection replaces the current displayed quote

### Chat Preparation

- draft quote injects hidden system context for one send only
- pinned quote injects hidden system context on every send
- draft quote clears after send
- pinned quote survives conversation persistence
- quote injection coexists with attached MCP resource messages

## File Impact

Expected areas of change:

- `manifest.json`
- `src/background/index.ts`
- `src/shared/types.ts`
- `src/content/index.tsx`
- new helper and test files for quote context construction and UI/state handling
- locale strings if the menu label or chip actions are localized

## Recommended V1 Boundaries

- single quote only
- browser context menu only
- text-only quote chip
- no page metadata
- draft quote is ephemeral
- pinned quote is per-conversation

These boundaries keep the first version small, understandable, and compatible with the existing chat architecture.
