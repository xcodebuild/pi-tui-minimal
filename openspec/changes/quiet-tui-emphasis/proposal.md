## Why

The quiet style removed every filled background band and left every row in the theme's `dim` slot, so nothing in the transcript carries weight. A tool row, its counts, its path, and its description all read at the same intensity, and the thinking header is indistinguishable from the text under it. Scannable, not louder, is the goal: the transcript should still be quiet, but the eye should land on the marker and the action first.

## What Changes

- Add an emphasis layer (`src/emphasis.ts`) over the one-line rows: the `◆` marker and the action word (`Run`, `Read`, `Listed`, `Searched`, `Found`, `Thought`, `Thinking`, `edit`, `write`, expanded inspect names) are accented and bold, counts, paths and durations are bold, and descriptions, merge nouns and command text stay in the theme's `dim` slot.
- Error rows keep the theme's `error` color and gain bold on the marker, the tool name and the trailing `exit N` / `error` status — no second hue.
- Thinking labels (`◆ Thinking`, `◆ Thought for 0.4s`, and the hidden-thinking label) get the same accent through the Markdown transformer. Because pi wraps each thinking line in `fg("thinkingText")` and a nested color span ends with a foreground reset, the duration text re-opens the thinking color so it stays dim instead of falling back to the terminal default.
- Emphasis is a pure string transform applied at the two choke points every row already passes through (`headerLine` for tool rows, the thinking transformer for labels). `src/summaries.ts` keeps returning plain text.
- **BREAKING (spec wording only, not user-visible)**: the "No filled box backgrounds" requirement currently ends with "Emphasis MUST use foreground color, dim text, and at most a single-character prefix or thin horizontal rule". Bold is now part of the emphasis contract, so that sentence is split out into its own requirement and reworded.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `quiet-tui`: the "No filled box backgrounds" requirement keeps its background contract and drops the emphasis sentence, which becomes a new "Row emphasis uses accent and weight" requirement covering what is accented, what is bold, what stays dim, and how thinking labels are styled. The "Errors stay one line until expanded" requirement gains the failure styling contract (error color kept, marker / name / status bold, no second hue) and the scenario that checks it.

## Impact

- `src/emphasis.ts` (new), `src/render.ts` (`headerLine` / `errorLine` route through the emphasis layer), `src/thinking.ts` (a `styleLabel` seam; the session theme is captured at `session_start`), `README.md`, and the tests: `test/emphasis.test.ts` (new), `test/tools.test.ts`, `test/thinking.test.ts`, `test/extension.test.ts`, `test/fake-theme.ts`.
- Display-only, like the rest of the extension: the ANSI codes go into what pi renders (tool-row components, and Markdown the transformer returns, which pi documents as display-only). The session file and the model context keep the plain text (`◆ Thinking`, `◆ Thought for 0.4s`, and the raw tool result).
- Weight comes from `theme.bold`, which is chalk-backed and follows the terminal's color support; a terminal without bold simply renders the accent alone.
- Out of scope: restyling rows owned by other extensions (subagents, `ask_user_question`, goals, fff search) — the public API still cannot reach their renderers.
