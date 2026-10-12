## Why

The quiet style fixed *height* (one line per row, no moving transcript) and *background* (no fill bands), but the recorded session in `pi-report-demo.cast` shows the transcript degraded into an equal-weight wall: 38 rows, of which 16 are `◆ Thought …` and 19 carry a sub-second clock, and **every** row opens with the same accent-bold `◆ <verb>` at column 0. Nothing is skimmable — the eye has to read every line, the running row is the *least* visible one, a failure looks like a success, and the most informative part of a long path is the part that gets cut.

Measured on that recording: `Thought` rows are 42% of the transcript, rows carrying `<1s` clocks are 50%, and 38/38 markers are the same accented diamond. The metadata (token counts, `0.0s` clocks) is louder than the work.

## What Changes

Grouped by the problem each one fixes. All twelve were identified from the recording and cross-checked against `src/` and `openspec/specs/quiet-tui/spec.md`.

**Noise — stop drawing rows that carry no information**

1. **Sub-second clocks are not drawn.** `formatDuration` currently always renders one decimal, so the transcript fills with `for 0.0s` / `for 0.1s`. A clock is drawn only once the elapsed time reaches 1s; below that the row is just its title. Applies to running and settled rows alike.
2. **Thinking rows drop a level but stay visible.** `◆ Thought 1,234 tokens for 1.2s` currently wears the same accented marker, bold action word, and dim tail as a real action. It becomes a lightweight marker (`·`) with no accent and no bold anywhere on the label — every thinking run stays on one line with its token count and duration, but it reads as a note, not a deed.
3. **Consecutive fast runs merge.** `bash` rows are exempt from merging by spec today, which is why the recording shows a ladder of `◆ Ran X for 0.1s`. Consecutive runs that each settled in under 1s and have no assistant text, `edit`, or `write` between them merge into one `Ran 3 commands` line listing at most two descriptions and a `+N more` remainder. Slow runs never merge, so the commands that did real work keep their own rows. **BREAKING** (spec: "Bash rows stay separate").

**Hierarchy — make prose and machinery visually distinct**

4. **Agent rows get a two-column gutter.** Assistant prose and tool rows currently share column 0, so only the `◆` distinguishes them. Agent output rows are indented two columns; the user's `❯` prompt stays at column 0 as the turn anchor.
5. **Wrapped rows hang-indent.** A substituted row that wraps today puts its continuation at column 0, breaking the rail the `◆` establishes. Continuation lines align under the row body instead.

**Metrics — give the numbers a column**

6. **A right-aligned metric column.** Duration, token count, `+N −M`, and `exit N` are glued to the end of a variable-length title, so no two rows line up. They move to a dim, right-aligned column with a guaranteed minimum gap, dropped when the left side does not fit.

**Semantics and color — say what happened**

7. **Errors stop borrowing the success marker.** A failed row becomes `×` instead of `◆`, keeping the theme's `error` color and its bold status. **BREAKING** (spec currently requires the `◆` on error rows).
8. **Paths keep their basename.** `shortReadPath` truncates from the right, so `src/very/long/path/to/file.ts` loses `file.ts`. Truncation elides the middle (`src/very/…/file.ts`) and expanded rows stop printing a full absolute path when the file is under the session cwd or the home directory.
9. **The running row is the brightest row.** Today the live glyph is bold pure yellow (the loudest thing on screen) while the row body stays dim, and the braille frames are visually lighter than `◆`. The glyph moves off `warning`, and a running row's title is drawn a step brighter than a settled one.
10. **A gray ladder with three distinguishable steps.** `dim #666666` / `muted #808080` / `text ""` (terminal default) are too close or too far apart, and the terminal default leaves prose at full brightness against everything else. The three foreground steps are re-spaced and `text` gets an explicit soft value; `accent` use drops with item 2 (thinking rows no longer accent), so it recovers its meaning as an accent.
11. **The metric rail stops at 80 columns without capping titles.** On a wide terminal, aligning clocks to the physical right edge creates a large visual hole between the description and its measurement. Short tool and thinking rows align their measurements on an 80-column rail, while titles still use the terminal's real width and do not wrap early. When a title crosses the rail, its measurement follows after the minimum gap.
12. **One blank line marks a prose boundary.** The transcript still removes repetitive spacers inside a run of tools and thinking labels, but preserves one blank line where actual assistant prose meets a tool block or thinking label. The result stays compact during execution while the final explanation gets a visible phase break.

## Capabilities

### New Capabilities

None — every change lands inside the existing quiet rendering contract.

### Modified Capabilities

- `quiet-tui`:
  - **Row emphasis uses accent and weight** — **removed and restated** as *Row styling uses a marker table, accent, and weight*: the marker set grows to four states (settled `◆`, live glyph, thinking `·`, failed `×`) and thinking labels stop being accented. Every scenario carries over except the one that asserted accented thinking labels. *(items 2, 9)*
  - **Row layout uses a gutter and a metric column** — *new requirement*: the two-column gutter, the hanging indent, and the right-aligned metric column. *(items 4, 5, 6)*
  - **Transcript spacing marks phase boundaries** — *new requirement*: keep execution rows tight, but preserve one blank where prose meets tools or thinking. *(item 12)*
  - **Non-mutation tools stream then collapse** — the run clock is omitted below 1s; a running row draws its title brighter than a settled one. *(items 1, 9)*
  - **Consecutive fast runs merge into one summary line** — *new requirement*: consecutive sub-second runs merge into one line, the way inspect calls already do; the inspect-burst requirement is untouched, and a run row still splits an inspect burst. *(item 3)*
  - **Bash rows stay separate** — narrowed: only runs that took 1s or more (and runs split by text, `edit`, `write`, or an inspect row) are guaranteed their own row. **BREAKING**. *(item 3)*
  - **Write and edit report the size of the change while streaming** — the streamed counts move from inline text into the metric column. *(item 6)*
  - **Errors stay one line until expanded** — the collapsed error row wears `×`, not `◆`; the marker, name, and status stay bold in the error color. **BREAKING**. *(items 7, 6)*
  - **Thinking streams inline in the transcript then collapses in place** — the label is the lightweight `·` form and remains visible for every run; counts, duration, and `Ctrl+O` expansion are unchanged. *(item 2)*
  - **Read, grep, and list rows keep their file name** — *new requirement*: middle elision instead of right truncation, and cwd-relative paths for expanded rows. *(item 8)*
  - **Theme keeps a readable foreground ladder** — *new requirement*: `dim` / `muted` / `text` are three distinguishable steps and `text` is explicit. *(item 10)*

## Impact

Spec operations in this change: six additions, five modifications, one removal with a restatement (see `specs/quiet-tui/spec.md`).

- `src/summaries.ts` — duration formatting, path elision, merge formatting for runs, thinking labels.
- `src/emphasis.ts` — marker table (thinking, error), running-row brightness, metric separation.
- `src/render.ts` — row components: gutter, capped metric rail, hanging indent.
- `src/burst.ts` / `src/tools.ts` — run merging alongside the existing inspect burst.
- `src/spacing.ts` / `src/rows.ts` — gutter and hanging indent for substituted rows, plus selective prose-boundary spacing; `mouseLayout` heights and click offsets must keep matching the new line counts.
- `src/thinking.ts` — label styling for the lightweight form.
- `src/live.ts` — live glyph styling/color hook.
- `themes/quiet.json` — foreground ladder, live-glyph color, `text`.
- `test/*.test.ts` — existing assertions that encode the old shapes (`◆ Thought`, `for 0.0s`, absolute expanded paths, `◆` on errors) must be updated; new tests cover gutter width, metric alignment, middle elision, and run merging.
- `README.md` — the demo and any feature description that shows the old row shapes.
- No API, dependency, or model-visible change: tool results, session storage, print/RPC modes, and the `Ctrl+O` expansion contract stay exactly as they are.
