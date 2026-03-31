# Repo Rules

## Repo Hygiene

- Never commit machine-specific absolute filesystem paths.
- Do not add local-only paths such as `/Users/...`, `/home/...`, `C:\...`, `file://...`, or editor-specific local URIs to tracked docs, rules, fixtures, tests, or source comments unless explicitly required and reviewed.
- Prefer plain relative paths like `pnpm-lock.yaml` or `_locales/en/messages.json`.

## Package Manager

- Use `pnpm` only.
- Do not use `npm` or `bun` for install, build, test, or lockfile updates.
- Treat `pnpm-lock.yaml` as the single source of truth for dependency resolution.
- Do not add `package-lock.json`, `bun.lock`, or other package-manager lockfiles.

## i18n

- Any new user-visible string must be localized.
- Update both:
  - `_locales/en/messages.json`
  - `_locales/zh/messages.json`
- Prefer existing `t(...)` / `chrome.i18n.getMessage(...)` flows over inline strings.
- Inline hardcoded strings are acceptable only in tests or in non-user-facing internal code paths.

## Icons

- Do not use plain text as an icon substitute.
- In content, popup, and general React UI, use `lucide-react` icons unless the area already follows a different established pattern.
- In the options pages, preserve the existing `MaterialSymbolIcon` pattern.
- If an icon is unavailable, fall back to another valid icon component, not text placeholders like `QUOTE`, `X`, or similar.

## UX Changes

- When adding a new control with visible labels, check whether the label is necessary or whether the UI already has enough context.
- Avoid redundant `title` attributes on controls or content unless they add distinct value beyond the visible UI.

## Verification

- Before considering UI work complete:
  - run focused tests for the touched area
  - run `bunx tsc --noEmit`
  - if the extension behavior changed, rebuild with `pnpm build`
