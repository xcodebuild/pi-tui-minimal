## Context

See `proposal.md` for motivation and `specs/quiet-tui/spec.md` for the contract. Verified against `@earendil-works/pi-coding-agent` 0.85.1 and `@juicesharp/rpiv-ask-user-question` 2.10.1.

**The row cannot be registered, so it is substituted.** `ExtensionRunner.getAllRegisteredTools()` (`dist/core/extensions/runner.js:325`) keeps the first registration per name, `interactive-mode.js:2630/3019` builds each row from that lookup, and the questionnaire package is listed before this one in `settings.json` — a second `registerTool({name: "ask_user_question"})` from this extension would be dropped, and it could not delegate `execute` to the original anyway (`pi.getAllTools()` returns copies without `execute` or renderers). The row is therefore rewritten where this extension already holds a hook: the patched transcript container's `render`, which receives each child component.

**What the row looks like today.** For a tool that has a definition but no `renderCall`/`renderResult`, `ToolExecutionComponent` renders `createCallFallback()` and `createResultFallback()` inside `contentBox = new Box(1, 1, bgFn)` — one column of indent, one blank line of vertical padding, `ask_user_question` in bold, then up to `FALLBACK_PREVIEW_LINES = 10` lines of the result text. The questionnaire's result text is the LLM-facing envelope (`User has answered your questions: "Q"="A". … You can now continue with the user's answers in mind.`), and its structured form rides `details.answers` (verified persisted in a session file: `{"role":"toolResult","toolName":"ask_user_question","content":[…],"details":{"answers":[{"questionIndex":0,"question":"…","kind":"option","answer":"…"}, …]}}`).

**Overlay vs row.** The questionnaire the user answers is `ctx.ui.custom(..., {overlay: true})`, a bottom-anchored full-width overlay with its own `DynamicBorder` and `selectedBg` selection bands. It is not part of the transcript container and is left alone (see the decision below).

## Goals / Non-Goals

**Goals:**

- One `◆` line for the questionnaire row in every state, consistent with the other tool rows: pending, answered, declined, error.
- The answers readable on demand: `Ctrl+O` shows one `"<chip>"="<answer>"` line per question, plus notes.
- No new coupling beyond what the container patch already accepts: if pi renames the fields, the row silently returns to pi's box.

**Non-Goals:**

- Re-registering, wrapping, or proxying another package's tool.
- Touching the questionnaire overlay, its selection bands, or the shared `selectedBg` slot (whose other users are pi's `/model`, session, and tree selectors).
- Restyling any other third-party row (subagent, goal, fff search).
- Any change to the model-visible tool result.

## Decisions

### 1. Substitute inside the container patch, keyed off the row's field shape

`patchContainer` already walks `mouseLayout.children` and rewrites each child's lines; the questionnaire is the one child whose lines are *replaced* rather than tightened:

```ts
const replaced = theme ? questionnaireRowLines(entry?.component, theme) : undefined;
const final = replaced ? carryEscapes(tightened, replaced).flatMap((line) => wrapTextWithAnsi(line, width)) : tightened;
```

`questionnaireRowLines` returns `undefined` unless the component has `toolName === "ask_user_question"` **and** `updateResult` (the shape `ToolExecutionComponent` gives every tool row), so nothing else is affected and a renamed field means "keep pi's rendering". This is the same private-API tolerance the spacing patch already documents, not a new class of coupling.

Alternatives rejected: **a second `registerTool`** (loses the name race, and cannot reuse the original `execute`); **prototype-patching `ToolExecutionComponent`** (the wider instance of the private-API route the user rejected when `quiet-tui-coverage` was written); **importing the questionnaire package to re-register it** (double-initializes its state and still loses the race).

### 2. Width is the patch's job, not the row's

pi's rows are wrapped by the `Text` component they render into; a substituted row has no `Text`, so the patch wraps each substituted line with pi-tui's exported `wrapTextWithAnsi(line, width)`. Without this, a long chip list (up to 4 × 16 characters) or a long question key would emit a line wider than the terminal.

### 3. The row's four states, and what each says

| State | Line |
| --- | --- |
| pending (`isPartial`) | `◆ Asking UI 框架, 补丁范围` |
| answered | `◆ Asked UI 框架, 补丁范围` |
| declined (`details.cancelled`) | `◆ Asked UI 框架, 补丁范围  declined` |
| failed (`details.error`) | `◆ ask_user_question  At most 4 questions are allowed …` |
| expanded | the state line, then `"UI 框架"="Claude Code UI"` per answer, then `notes: …` |

The title is the model's own chips (`questions[].header`) in call order, falling back to `1 question` / `N questions` when it authored none. Answers come from `details.answers` — the same data the envelope is built from — with `multi` joined by `, ` and an empty answer shown as `(no input)`, matching the questionnaire's own formatting. A selected option's `preview` is deliberately not repeated: the user read it in the overlay, and it is markdown that would swamp the transcript. Rows restored from a session that predates `details.answers` fall back to the envelope text, so the expanded view is never empty.

The states are styled through the existing emphasis layer (`emphasizeHeader` / `emphasizeError`), so `◆` and `Asked` are accented and bold and the chips stay dim, with no second hue; errors use `formatToolError`'s `◆ <tool>  <detail>` shape with the envelope's `Error: ` prefix stripped.

### 4. The questionnaire ends an inspect burst

A read before the questionnaire and a read after it are not consecutive any more than reads split by `bash` are, and merging them would paint the merged line below the questionnaire row while the earlier row's own line disappears. `isBurstSplitTool` gains the tool name and `src/tools.ts` uses that predicate instead of its two inline `bash`/`edit`/`write` checks.

### 5. The theme arrives through the Spacing handle

The substitution needs colors, and `patchContainer` is installed before `session_start` (the container is patched on the first row render, the theme is attached when the session starts). `Spacing.attachTheme(theme)` stores `ctx.ui.theme` — the live proxy, so it keeps reading the theme even after `applyThemePatch` installs the patched clone — and the patched render reads it per render, not per patch.

### 6. The overlay is left alone

The questionnaire's selection bands come from `selectedBg`, which pi's `/model`, session, and tree selectors also use to mark the selected row. Stripping it globally would change all of them, and stripping it only while the questionnaire is open (keyed off the package's `rpiv:ask-user:blocked` event) buys one band in an overlay the user is looking at anyway — the rpiv view already marks the focused row with an accented `→` and bold text. Decided: leave the overlay, its bands, and the theme untouched.

## Risks / Trade-offs

- [pi renames `toolName`/`args`/`result`/`isPartial`/`expanded`] → `questionnaireRowLines` returns `undefined` and the row keeps pi's box; `test/questionnaire.test.ts` pins the shape against the real `ToolExecutionComponent`, so the regression shows up as a failing test rather than a silent restyle.
- [The plugin is not installed] → the check is a string comparison against a row that never appears; nothing else changes.
- [An answer's `notes` contain newlines] → `wrapTextWithAnsi` splits on `\n` and wraps each line, and the row's height is recomputed in `mouseLayout`.
- [A very long chip list] → wrapped, so the row grows to two lines instead of overflowing the terminal.
- [pi's default box is skipped, so the value shown is our summary rather than the raw envelope] → the envelope is still the model-visible result; `Ctrl+O` shows the structured answers, and nothing is hidden from the session.

## Migration Plan

- Display-only; no session, settings, or data migration.
- Rollout: unchanged (`pi -e`, `pi install`, or the copy under `~/.pi/agent/extensions/`).
- Rollback: unload the extension; the row returns to pi's default box on the next start.
