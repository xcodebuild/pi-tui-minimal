## Context

See `proposal.md` — Why, and `specs/quiet-tui/spec.md` in this change for the required behavior.

The constraint that shapes everything below: a row reaches the screen through **two different render paths**, and both must produce the same layout.

- **Rows this extension registers** (`read`, `bash`, `edit`, `write`, `find`, `grep`, `ls` — `src/tools.ts`) are returned as a `Component` from `renderCall` / `renderResult`. pi calls `component.render(width)` at paint time, so the width is available *then*, never at construction. Today those components are `new Text(text, 0, 0)`.
- **Rows it cannot register** (the questionnaire, the FFF tools, subagent/MCP tools — `src/rows.ts`, `src/questionnaire.ts`) are substituted inside the transcript container patch (`src/spacing.ts`), which already renders from `patchedRender(width)` and therefore already does its own wrapping (`wrapTextWithAnsi`).

Other constraints from the current code:

- `spacing.ts` repairs `mouseLayout` child heights and click offsets whenever a substitution changes a row's line count. Anything that can add or remove a line (metric-on-its-own-line, wrapping) has to keep that repair correct.
- The style is always on: no toggle, no command, no config (`spec.md` — Style is active on load). Every change here is visible immediately after install.
- Running and settled views of one row must keep the same line count, or pi repaints the whole screen and clears scrollback (`src/render.ts` header comment).
- `tests/` are pure string assertions against `fakeTheme` / `markerTheme` (`test/fake-theme.ts`), with 214 passing tests as the baseline. Layout has to be assertable without a TUI.
- Five in-flight changes (`quiet-tui-coverage`, `-emphasis`, `-live-glyph`, `-prompt-marker`, `-questionnaire`) are complete except for a manual verification task each; their expectations describe the *old* row shapes.

## Goals / Non-Goals

**Goals:**

- One layout function used by both render paths, so the gutter, the hanging indent, and the metric column cannot drift apart.
- Keep the work testable as plain strings: layout is a pure function of `(row parts, width)`.
- Land in phases, each leaving the suite green, with the noisiest wins first.

**Non-Goals:**

- No per-turn faded accent (only the thinking label gives up its accent, per the proposal's item 2).
- No new dependency, theme file, or capability detection.
- No rewrite of pi's composer, status line, or markdown rendering.
- No change to what the model sees, what the session stores, or print/RPC output.
- Not touching the inspect-burst rules: `src/burst.ts`'s inspect track keeps its semantics; run merging is added beside it.

## Decisions

### D1. Row parts are structured data; one formatter lays them out

Today every row is flattened to a single string as early as possible (`formatRunLine`, `formatWriteLines`, `formatDiffCounts`, …) and then wrapped where a width happens to exist. A metric column needs the title and the measurement to stay separate until the width is known.

Introduce in `src/summaries.ts`:

```ts
export type RowParts = {
  title: string;      // "◆ Ran git status"  (marker already styled by emphasis)
  metric?: string;    // "1.2s" | "1,234 tokens" | "+12 −3" | "exit 1"
};
```

and a single layout function (in `src/render.ts`):

```ts
export function layoutRow(parts: RowParts, width: number): string[]
```

Rules, in order: indent the title by `GUTTER` (2); wrap the title to `width` with `wrapTextWithAnsi`; if `metric` is set, try to append it right-aligned to the last title line with at least `METRIC_GAP` (2) columns between them; if it does not fit, put it right-aligned on its own following line. Continuation lines are indented by `GUTTER + 2` (the hanging indent that clears the marker).

Callers:

- our own rows return a small `Component` (`rowComponent(theme, parts)`) whose `render(width)` is `layoutRow(parts, width)`, replacing `headerLine` / `lineComponent` / `dimLine` / `stack` bodies;
- `spacing.ts` calls `layoutRow` for substituted rows instead of `wrapTextWithAnsi`, and keeps its existing `entry.height` / `offsetClicks` repair.

*Alternatives considered:* teaching `Text` to right-align (it has no metric concept, and its cache keys on width + text only); padding with spaces at construction time (the width is unknown at construction — this is exactly the bug that makes the current inline clocks unalignable).

### D2. Metrics get a reserved column, so height never depends on the clock

A live clock appears at 1s and stops at settle; a token count grows while streaming. If the metric's arrival could push the row from one line to two, the transcript would shift mid-turn — the thing this extension exists to prevent.

`layoutRow` therefore reserves room for the widest metric a row can carry (`METRIC_RESERVE`, sized from `59m 59s` / 4-digit counts) when deciding whether the title fits on one line. A row that has a metric is laid out as if the metric were already at its widest, so a running row and its settled view draw the same number of lines.

*Alternative considered:* re-laying out on each metric change and accepting the shift — rejected, it re-introduces the repaint/scrollback flash (`src/render.ts`).

### D3. Four markers, one closed table

`src/emphasis.ts` currently keys on `◆` and "is one of the live frames". Widen that to a marker table, since the spec now names four states:

| state | marker | paint |
| --- | --- | --- |
| settled (success) | `◆` | accent, bold |
| running | live glyph (`src/live.ts`) | accent, bold; row title a step brighter |
| thinking label | `·` | `dim`, no bold |
| failed | `×` | `error` color, bold |

`takeMarker` recognises all four so `emphasizeHeader` / `emphasizeError` / `emphasizeThinkingLabel` keep working on the same plain-text rows. Live-frame detection (`isLiveGlyph`) stays as it is.

### D4. Sub-second clocks are suppressed in the parts builders, not in `formatDuration`

`formatDuration` is shared by run rows and thinking labels, and is a pure formatter with its own tests. The decision to *show* a clock moves to the parts builders (`runParts`, `thoughtParts`): include `metric` only when the elapsed time is known and `>= 1`. `formatDuration` keeps its current shape for the >= 1 case. A live row under a second draws no clock; the live glyph is still the running cue. The thinking token count stays inline in the label's title rather than moving to the metric column — the recording shows the count reads better next to the word, and it keeps the label's existing tests meaningful.

### D5. Run merging is a second track in the existing burst tracker

`src/burst.ts` already owns "what splits a burst" and "who paints the merged line". A separate class would duplicate both and could disagree with the inspect rules. Instead `BurstTracker` gains a run track with the same shape:

- the same `noteSplit()` closes the run burst (assistant text, `edit`, `write`, and inspect rows are split tools; a `bash` row that runs >= 1s also closes the run burst);
- `completeRun(id, seconds, error, summary)` mirrors `complete()`: errors are recorded but never counted or made owner, the owner is the first success, and the owner is repainted through the invalidator registered in `renderCall`;
- `shouldPaintCollapsed` returns false for non-owner members, so the merged line stays where the run started;
- the merged parts are `Ran N commands: a, b +K more` with `metric` = the summed duration of the covered runs; at `N === 1` the ordinary single-run parts are used instead, so a lone run never reads `Ran 1 commands`;
- membership is disjoint: a call is either an inspect entry or a run entry, never both, and a run row still splits an inspect burst (the inspect requirement is unchanged).

*Alternative considered:* merge any consecutive runs regardless of duration — rejected, it hides the 9s test-suite row inside a summary, which is the opposite of the intent. *Alternative:* merge by description-prefix heuristics — rejected as unpredictable.

### D6. Errors adopt `×`, and the exit code moves to the metric

`emphasizeError` already recomputes the row from the plain text, so it only needs the new marker (D3). `formatRunError` / `formatToolError` return parts with the exit code or error text as the metric, which removes their hard-coded two-space join and lets the code line up across rows. The `error` color and the bold marker/name/status are unchanged.

### D7. Paths elide in the middle, and expanded rows stay relative

`shortReadPath` currently slices from the right (`out.slice(0, 39)`), which deletes the basename. Replace with `elideMiddle(path, max)`: keep the basename (and its extension) intact, keep as many leading directory segments as fit, join with `…/`. If the basename alone does not fit, truncate the basename from the left. `rowPath` stops calling `absolutePath` for expanded rows and uses the same shortening with a wider budget; `absolutePath` becomes unused and is deleted with its tests.

*Alternative considered:* left truncation (`…/code/pi-tui-minimal/report.html`) everywhere — good for expanded rows, but on a collapsed burst line it spends the budget on directory prefixes. Middle elision serves both, so one rule is kept.

### D8. The gutter is applied at layout time, not by pi's components

Applying the indent inside `layoutRow` (D1) means both render paths get it, expanded output blocks included (`rowComponent` wraps the whole block, diff and captured output alike), and the tightening pass in `spacing.ts` is unaffected because it drops blank lines before layout. The prompt keeps its `❯` at column 0: `prompt.ts` splices into pi's own leading padding, which is untouched by this change.

### D9. Theme values are explicit, and the spinner stops shouting

`themes/quiet.json` gets a re-spaced ladder and an explicit `text`:

| slot | today | proposed | role |
| --- | --- | --- | --- |
| `text` | `""` (terminal default) | `#d8d8d8` | assistant prose |
| `toolOutput` | `#808080` | `#a0a0a0` | expanded output |
| `muted` | `#808080` | `#8a8a8a` | secondary chrome |
| `dim` | `#666666` | `#6b6b6b` | row tails, metric column |
| `error` | `#cc6666` (= `toolDiffRemoved`) | `#e05555` | failures |
| `toolDiffRemoved` | `#cc6666` | `#b05252` | removed lines |

The running marker moves from `warning` (pure `#ffff00`) to `accent`, so the brightest element on screen is never a spinner; the row-level running cue is the brighter title (D10). `#d8d8d8` and the re-spaced grays keep `text` / `toolOutput` / `dim` apart on a dark background; separating `error` from `toolDiffRemoved` by luminance is what makes the grayscale scenario satisfiable at all — today they are the same hex. Values are a starting point: the task list verifies them on a real terminal and adjusts within the same ladder.

### D10. Running rows are marked by brightness, not by saturation

`emphasizeHeader` takes the row's running state (it already receives the marker) and paints the title/body from `text` while running instead of `dim`. Nothing else about the row changes, so a running row is not louder by hue — it is simply the brightest text in a dim transcript.

### D11. The metric rail is capped, not terminal-wide

`layoutRow` wraps titles against the actual transcript width, while the preferred metric position is `min(width, 80)`. Short rows therefore keep a scannable metric column without making tool text wrap earlier than assistant prose. When a title crosses the preferred rail, the metric follows it after the two-column minimum gap; only a metric that cannot share the physical row moves to its own line. A thinking label with no duration still passes through this layout path, so every execution row keeps the same two-column gutter.

Room for `metricReserve` is taken from the physical transcript width, not the 80-column rail, so a late clock still cannot change the row's height. The rail is a preferred alignment point rather than a content boundary.

### D12. Spacing is selective at prose boundaries

The transcript patch classifies each rendered nonblank block as tool, thinking label, prose, or other. An all-blank `Spacer` is retained as one line only when its nearest nonblank neighbors are prose and either a tool or thinking label; it is dropped everywhere else. The same decision runs in the top-level transcript container and inside an assistant message's `contentContainer`, so both a final answer after tools and an answer after its own thought label receive one phase break.

Thinking remains visible for every run. Its marker, word, token count, and duration are all plain dim text; removing the count's bold span lowers its weight without removing information or introducing a threshold whose behavior would be surprising near the cutoff.

## Risks / Trade-offs

- **[Right-aligning metrics needs the width, which our own rows only get inside `render`]** → D1's `rowComponent(parts).render(width)`; no width is needed at construction, and the pure `layoutRow` is directly unit-testable.
- **[A metric that arrives mid-run could add a line and shift the transcript]** → D2's reserved metric column, plus the existing "same height running and settled" tests extended to the new rows.
- **[The gutter breaks `mouseLayout` click routing for substituted rows]** → the spacing patch already recomputes `entry.height` and offsets clicks; the gutter does not change line counts, but the metric's own-line case can, so the offset repair is covered by a spacing test.
- **[Two merge families in one tracker contaminate each other]** → disjoint membership in D5, explicit split tests for `bash`-between-inspects and inspect-between-runs.
- **[Hiding quick runs surprises the user]** → only sub-second runs merge, the line names how many commands it covers and lists them, `Ctrl+O` unmerges, and a failed run always keeps its own row.
- **[BREAKING spec changes vs. the five in-flight changes' manual checks]** → those verification tasks assert the old shapes (`◆ Thought`, `for 0.0s`, absolute expanded paths, `◆` on errors); they are re-run against the new shapes in the final phase, and this change is not archived until they pass.
- **[Middle elision can hide which directory a file came from]** → the basename is preserved (the point), the elision marker is explicit, and `Ctrl+O` expansion shows the wider form.
- **[Theme values are terminal-dependent]** → the ladder is verified on a dark terminal in the final phase; the theme file is a single small JSON, so adjusting is cheap and does not touch code.
- **[Selective spacing could restore every old spacer]** → D12 keys on rendered semantics, not component type alone: thought/tool transitions remain tight, and only a boundary involving actual prose keeps one line.

## Migration Plan

No data, config, or API migration: the change is presentation-only and has no toggle. Land in four phases, each green:

1. **Parts and markers** — D1's `RowParts` + `layoutRow` (no visual change yet), D3's marker table, D4's clock suppression, the lightweight thinking label. This is where the noise wins land.
2. **Layout** — D8's gutter, the hanging indent, D2's metric column, D6's exit code as a metric. Largest diff; goes through `render.ts` and `spacing.ts` together.
3. **Semantics and paths** — D5's run merging, D6's `×` marker, D7's path elision.
4. **Theme and evidence** — D9's palette, D10, README/demo refresh, re-run the in-flight manual verification tasks against the new shapes.

Rollback: each phase is one commit; phases 2–4 revert independently of 1, and nothing outside `src/`, `themes/`, `test/`, and the docs depends on the new shapes.

## Open Questions

- Whether `themes/quiet.json` should declare an `appearance` (`dark`) so pi's system-theme fallback stops guessing: safe to defer, no spec depends on it, and the color ladder is verified on a dark terminal either way.
