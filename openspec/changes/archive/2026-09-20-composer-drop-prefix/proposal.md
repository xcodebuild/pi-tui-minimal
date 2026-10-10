## Why

The composer prefix is broken in practice. `applyComposerChrome` decides what a "content line" is by position — everything except the first and last line — but pi's `Editor.render()` puts the autocomplete list in that same array, so every slash-command and file-suggestion row gets a second prompt marker (`> → /model`) on top of pi's own `→`. The same function also rewrites the horizontal rules through `replace(/[^-─]/g, "─")`, which erases the `↑ N more` / `↓ N more` scroll indicators and the working-status text `CustomEditor` embeds in the top rule. The `>` was never worth those two regressions: pi's editor draws no prompt marker of its own, so the extension only needs dim rules to keep the quiet look.

## What Changes

- **BREAKING (visual)**: the composer renders **no prompt prefix**. `PREFIX` and the per-line prefixing are removed; the input row starts where pi's editor starts.
- Delete the line-rewriting pass entirely. `QuietEditor` becomes a thin `CustomEditor` subclass that only overrides `borderColor` with the dim colorizer, so every line pi renders — input rows, scroll indicators, the top-rule working status, and the autocomplete list with its own `→` marker — is passed through untouched.
- **BREAKING (spec wording only, not user-visible)**: the "No filled box backgrounds" requirement drops "it MAY show a dim prefix (for example `>`)"; the composer scenario now forbids a prefix of its own and forbids rewriting pi's editor lines.
- Existing tests for `applyComposerChrome` are replaced by tests that drive a real editor instance and assert (a) no `>` prefix, (b) the rules use the given dim colorizer, (c) a long input still shows `↑ N more` / `↓ N more`, and (d) `QuietEditor.render()` output equals a stock `CustomEditor` on the same theme and width.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `quiet-tui`: the composer scenario in "No filled box backgrounds" no longer permits a prompt prefix and now requires pi's own editor lines to survive rendering; the rest of that requirement is unchanged.

## Impact

- `src/composer.ts` (prefix and `applyComposerChrome` removed), `test/composer.test.ts` (rewritten), `README.md` (composer bullet and the spacing note corrected). `src/chrome.ts` is unchanged — it still passes the dim colorizer from `ctx.ui.theme.fg("dim")`.
- Display-only: no tool execution, model-visible results, session data, permissions, or print/RPC behavior change. Composer input, keybindings, and pi's own autocomplete/scroll behavior are untouched.
- The `quiet-tui-emphasis` change is still unarchived and its delta repeats the prefix allowance, so that one line is updated in place; archiving it later would otherwise restore the old wording.
