## Why

`quiet-tui` removes the filled background bands pi paints, and the user's own turn is where that costs the most: pi's `UserMessageComponent` builds its content as `new Box(outputPad, 1, content => theme.bg("userMessageBg", content))`, so a prompt is a full-width rectangle that is instantly scannable. `quiet-tui-coverage` made the theme patch actually apply (`theme.ts` clones the live theme, because `ctx.ui.theme` is a read-only proxy), and the prompt lost that rectangle — leaving nothing but the blank line above it to mark where the user's turn starts. That reads as "my input has no background any more", and in a long transcript the turn boundary becomes hard to find.

## What Changes

- The prompt's first text line gains one accented, bold `❯` — the same marker family as the `◆` rows, drawn with the theme's `accent` + `bold` slots. It is a *boundary*, not a band: the no-fill requirement still holds and no background is painted.
- The marker is paid for by the prompt's own left padding, so it costs no columns (the row still fills the terminal width) and no rows (the line count is untouched, which leaves `mouseLayout`, click routing, and `Ctrl+O` expansion coordinates exactly where they were). A padding shorter than the marker is topped up from the row's trailing filler; Markdown wraps a prompt to `width - 2`, so that filler is always blank.
- It is a **splice into the lines pi already rendered**, not a rebuild: only the first line that carries text is rewritten, and everything else — the prompt's Markdown, tables, code blocks, pi's own wraps — stays byte-identical. The escapes that line opens with are re-emitted after the marker, because pi wraps the whole padded line in `bg(…)` and `fg(…)` closes with a `39m` foreground reset.
- The row is recognised by `UserMessageComponent`'s own fields (`text`, `outputPad`, `markdownTransformers`, and neither `contentContainer` nor `toolCallId`), so a pi release that renames them drops the marker instead of breaking the prompt.
- The transcript search now anchors on the prompt as well as on agent output, so a turn that has not produced output yet — including one the user aborts immediately — still gets its marker.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `quiet-tui`: the no-fill requirement gains its counterweight — the user's prompt is anchored by one `❯` on its first text line, drawn from the accent/weight slots rather than from a background band.

## Impact

- New `src/prompt.ts`; `src/ansi.ts` (the line-level escape helpers split out of `spacing.ts` so the marker can share them), `src/spacing.ts` (wiring the splice and the prompt anchor), `src/emphasis.ts` + `src/summaries.ts` (the marker glyph and its styling), plus their tests and `README.md`.
- Display-only: no change to the composer, to what the model sees, to stored session data, or to print/RPC output.
- Out of scope by decision: a background band for the prompt (rejected in `design.md`), a left rule or a full-width rule as the boundary, and any change to how the composer or tool rows are marked.
