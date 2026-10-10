## Context

See `proposal.md` — Why. The constraints that shape the approach:

- Every row is produced as a plain string by `src/summaries.ts` (`◆ Run …`, `Read 46 files, Listed 3 dirs`, `◆ src/a.ts  +12 −3`, `◆ Thought for 0.4s`) and only then handed to a renderer. `summaries.ts` is covered by tests that assert those strings as text.
- All tool rows flow through two functions in `src/render.ts`: `headerLine` (success, live tail, expanded) and `errorLine`. Nothing else styles a row.
- Thinking labels do not go through a renderer at all: they are Markdown **source** returned by the Markdown transformer, and pi renders that block itself, wrapping each line in `fg("thinkingText")` plus italic.
- `Theme` exposes `bold` / `italic` in addition to `fg` / `bg`, and the theme the extension installs (the `fg` remap of `thinkingText` → `dim`, and the empty fill slots) becomes what `ctx.ui.theme` returns afterwards — verified by reading pi's `theme` proxy (`globalThis[THEME_KEY]`) and `setThemeInstance`.

## Goals / Non-Goals

**Goals:**
- One place decides what carries weight, so a new row shape cannot quietly ship flat or loudly ship decorated.
- The formatters in `summaries.ts` stay plain-text and stay asserted as text.
- The styling survives the two very different render paths (component rows, and Markdown source) without leaking ANSI into anything but the display.

**Non-Goals:**
- Changing what any row *says* (no new counts, no new words).
- Making the palette louder: no new colors, no backgrounds, no second hue on errors.
- Reaching rows owned by other extensions; the public API has no hook for them.

## Decisions

**Emphasis is a string transform at the choke point, not part of the formatters.**
`emphasizeHeader` / `emphasizeError` in `src/emphasis.ts` re-parse the canonical row shapes (`◆ <action><detail>`, the merge grammar, the diff-count grammar) and return a styled string; `headerLine` / `errorLine` call them, so every existing caller and every existing test keeps working unchanged. *Alternative rejected:* teaching `summaries.ts` to return segments — it would churn the formatters, their callers, and their tests for a purely presentational concern, and every new row shape would need to thread style roles through.

**A regex grammar over shapes we own, with a total fallback.**
The shapes are not user input: they come from four functions in `summaries.ts` and two inline templates in `tools.ts`. So matching them is safe, and the default branch (accent the first word, dim the rest) reproduces exactly what the quiet style did before this change — an unrecognised row degrades to "no weight", never to dropped text or a crash. *Alternative rejected:* a generic "bold every number and path-like token" pass — it would decorate the model's own run descriptions, which the design wants dim.

**Thinking is styled inside the Markdown source, with the thinking color re-opened after the accented span.**
pi's Markdown renderer applies `defaultTextStyle` *after* layout: it wraps the rendered line in `fg("thinkingText")` and italic. A nested `fg` ends with a foreground reset (`39m`), so text following the accent span would drop to the terminal's default foreground. The label therefore re-opens `thinkingText` before its trailing text (` for 0.4s`). Verified against pi-tui's real `Markdown` component before implementing, and pinned by a test that renders through it. *Alternative rejected:* markdown `**bold**` only — it gives weight but no accent, and the whole point is that the marker is the anchor.

**The thinking controller takes its styler from the session theme at `session_start`, with an identity default.**
`transform` has no theme in its context, and `chrome.ts` installs the patched theme before `thinking.onSessionStart(ctx)` runs, so `ctx.ui.theme` at that moment is already the patched clone (its `thinkingText` → `dim` remap is what the trailing text re-opens). A `styleLabel` option lets tests drive the seam directly, and the default stays identity so the transformer's output is still the plain, assertable string in existing tests.

## Risks / Trade-offs

- [A row shape changes in `summaries.ts` and the emphasis grammar stops matching] → the fallback branch still renders the row (accent + dim), and `test/emphasis.test.ts` asserts each known shape by string, so a mismatch shows up as a failing expectation rather than a silent style regression.
- [putting ANSI into Markdown source could leak into stored content] → pi documents the Markdown transformer as display-only, and the change adds a test asserting the stored message and the transformer's non-display path are untouched. The transform is also re-run for restored sessions and width changes, which is fine because it is a pure function of the label text plus the session theme.
- [a theme switch after `session_start` leaves the styler holding the old theme] → the styler closes over whatever `ctx.ui.theme` was at session start; the accent and `dim` slots are the same in the shipped theme and in the clone, so the worst case is that a switched-to theme's `thinkingText` is not re-opened until restart. This matches the extension's existing theme caveat (the theme patch itself is dropped on `/theme`).
- [`theme.bold` is chalk-backed and follows terminal color support] → on a terminal without bold the accent still renders, so the anchor survives; weight is additive, never load-bearing.
- [emphasis on 46-row bursts could turn the merged line into noise] → the merge keeps exactly one accent per kind and one bold per count, and the nouns and commas stay dim, so the row reads as `Read 46 files, Listed 3 dirs` and not as a highlighted block.

## Migration Plan

Display-only, no data or config migration: the change is inside the extension, shipped with it. Rollback is reverting the emphasis layer and pointing `headerLine` / `errorLine` back at `fg("dim", …)` / `fg("error", …)`, which is the pre-change behavior; nothing outside the extension reads the styled strings.

## Open Questions

None.
