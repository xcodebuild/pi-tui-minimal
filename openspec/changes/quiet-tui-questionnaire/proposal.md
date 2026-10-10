## Why

`ask_user_question` is the one row in the transcript that does not look like this extension's output. The questionnaire itself is drawn by `@juicesharp/rpiv-ask-user-question` as a full-width overlay, but the tool row pi leaves behind is the generic fallback for an extension tool: a padded box with a blank line above and below, and up to ten lines of the answer envelope behind a `... (N more lines, ctrl+o to expand)` hint. Every other tool row is a `◆` one-liner.

`quiet-tui-coverage` recorded those rows as out of scope because "the public API cannot reach them": `ExtensionRunner.getAllRegisteredTools()` keeps the first registration per tool name, the questionnaire package loads first, and `pi.getAllTools()` hands out copies without renderers — so the row cannot be re-registered with quiet `renderCall`/`renderResult` slots. That reasoning still holds; what changed is the decision to reach it the same way the extension already reaches pi's spacers and theme: by patching the transcript container it owns a reference to.

## What Changes

- The transcript container patch learns to substitute a row's lines, not only to tighten them. For the questionnaire row and nothing else, `src/questionnaire.ts` returns the quiet lines; every other row keeps its own renderer (`ask_user_question` is matched by tool name and the component shape pi builds for it).
- The questionnaire row becomes one line in all four states: `◆ Asking <chips>` while the questionnaire waits for the user, `◆ Asked <chips>` when answered, `◆ Asked <chips>  declined` when the user abandons it, and the existing error form `◆ ask_user_question  <error>` when the host cannot render the questionnaire. `<chips>` are the model's own `header` values, falling back to a question count.
- `Ctrl+O` on that row expands to one `"<chip>"="<answer>"` line per question plus the user's notes, read from the tool result's `details.answers` (which pi persists). A session recorded before that shape existed falls back to the envelope text.
- The substituted lines are wrapped to the container width in the patch, because they no longer pass through the `Text` component that wraps pi's own rows.
- The questionnaire also ends an inspect burst (`isBurstSplitTool`), so reads on either side of it do not merge onto one summary line. The two hard-coded `bash`/`edit`/`write` checks in `src/tools.ts` now call that predicate.
- The theme the row is styled with arrives through `Spacing.attachTheme` at `session_start` (`ctx.ui.theme`, the same live theme the rest of the extension reads), so the container can be patched before it exists.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `quiet-tui`: the multi-line-tool requirement gains the questionnaire row — one `◆` line in every state, chip/answer detail only when expanded; the inspect-burst requirement gains the questionnaire as a burst boundary.

## Impact

- New `src/questionnaire.ts`; `src/spacing.ts` (row substitution, theme handle, width wrapping), `src/chrome.ts` (attaches the theme), `src/burst.ts` + `src/tools.ts` (split tool), plus their tests and `README.md`.
- Display-only: no tool execution, model-visible result, session data, or print/RPC behavior changes. The questionnaire overlay, its selection bands, and pi's own selectors are untouched.
- Out of scope by decision: restyling any other third-party tool row (subagent, goal, fff search) and any change to the questionnaire overlay's own look.
