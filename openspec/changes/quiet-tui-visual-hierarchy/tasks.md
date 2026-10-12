Baseline: `npm test` on the current working tree — 214 tests, 42 suites, all passing.

## 1. Row parts and the shared layout function

- [x] 1.1 Add `RowParts = { title: string; metric?: string }` to `src/summaries.ts` and derive the existing single-string formatters from it (`runParts`, `ranParts`, `writeParts`, `editParts`, `errorParts`, `thoughtParts`), keeping the old `format*` exports as thin `joinRow(parts)` wrappers so no existing test changes yet — verify `npm test` is still 214 passing.
- [x] 1.2 Implement `layoutRow(parts, width)` in `src/render.ts`: two-column gutter, `wrapTextWithAnsi` title wrapping, hanging-indent continuation at `GUTTER + 2`, right-aligned metric with a minimum two-column gap, and the metric on its own right-aligned line when it does not fit — verify with a new `test/layout.test.ts` covering: gutter on every line, hanging indent, right-aligned metric, metric-on-its-own-line, and a metric wider than the row.
- [x] 1.3 Implement `rowComponent(theme, parts)` (a `Component` whose `render(width)` is `layoutRow` and whose `invalidate()` is a no-op) and `outputBlock(theme, text)` for expanded blocks, and make `render.ts`'s `headerLine` / `errorLine` / `dimLine` / `stack` delegate to them — verify `test/tools.test.ts` and `test/rows.test.ts` still pass with the gutter present, updating only the expected strings.

## 2. Markers and emphasis

- [x] 2.1 Add the marker table (`◆` settled, live glyph running, `·` thinking, `×` failed) to `src/summaries.ts`, export `THOUGHT_MARKER` and `ERROR_MARKER`, and switch every `format*` that hard-codes a diamond to take its marker from the table — verify `test/emphasis.test.ts` covers a `·` and an `×` row being recognised by `takeMarker`.
- [x] 2.2 Teach `takeMarker` in `src/emphasis.ts` about `·` and `×`, paint `·` in the `dim` slot with no weight, and paint the running glyph from `accent` instead of `warning` — verify the new emphasis tests assert `[dim]·[/]`-style output for a thinking label and no `warning` slot for a running row.

## 3. Noise: clocks and the thinking label

- [x] 3.1 Suppress sub-second clocks in the parts builders so a settled run under 1s renders `◆ Ran <title>` with no metric, and a running row under 1s renders `⠋ Run <title>` — verify new `test/summaries.test.ts` cases assert no `0.0s` / `0.1s` anywhere and that a 2.4s run still renders `2.4s` in the metric.
- [x] 3.2 Render thinking labels in the light form (`· Thinking …`, `· Thought …`) with the token count inline, no accent, and no bold, for the streaming, collapsed, restored, and hidden-thinking labels; transcript labels keep the same two-column gutter even when no duration is present — verify `test/thinking.test.ts` and `test/emphasis.test.ts` assert the light form and that `Ctrl+O` still returns the raw thinking text.
- [x] 3.3 Re-run the whole suite and confirm the recording's noise classes are gone: no `Thought` row carries an accent, no row carries a sub-second clock — verify `npm test` passes and a fresh `grep`-style check over `test/` finds no assertion expecting `◆ Thought` or `for 0.0s`.
- [x] 3.4 Keep every streaming, settled, restored, and hidden Thought label visible, but remove the token count's bold span so the complete label is plain dim text — verify emphasis and thinking tests assert the count and duration remain present with no bold or accent.

## 4. Layout: gutter, hanging indent, metric column

- [x] 4.1 Apply `layoutRow` to every row this extension registers (`src/tools.ts`: read/find/grep/ls/burst line, bash, edit, write) and to their expanded output blocks — verify `test/tools.test.ts` asserts the two-column gutter on headers and expanded diffs, and that running and settled rows draw the same number of lines.
- [x] 4.2 Apply `layoutRow` inside `spacing.ts`'s substitution path for the questionnaire and foreign rows, replacing the current `wrapTextWithAnsi` call, and keep the `entry.height` / `offsetClicks` repair correct when the metric takes its own line — verify a new `test/spacing.test.ts` case asserts the repaired height and click offset for a row that grew a metric line.
- [x] 4.3 Move the diff counts and the `write` line count into the metric column (`+12 −3`, `128 lines`) and confirm the metric column is reserved so a streaming count cannot change the row's line count — verify updated `test/tools.test.ts` cases for streaming `write`/`edit` show a stable line count from first token to settle.
- [x] 4.4 Verify the prompt is unaffected by the gutter: `❯` still lands in column 0, the line count is unchanged, and click routing on the prompt still works — verify `test/prompt.test.ts` passes unchanged.
- [x] 4.5 Cap the preferred metric position at an 80-column rail without capping title width, so wide terminals keep metrics nearby but tool text wraps at the same physical width as prose — verify layout tests compare 80- and 160-column calls for short rows, and assert a long title remains one line beyond the rail with its metric immediately after it.
- [x] 4.6 Preserve exactly one spacer where prose meets a tool row or thinking label, while continuing to remove spacers inside thought/tool execution sequences and preserving paragraph breaks — verify spacing tests cover top-level tool/prose, nested thought/prose, and thought/tool boundaries plus repaired layout heights.

## 5. Consecutive fast runs merge

- [x] 5.1 Add the run track to `BurstTracker` (`completeRun`, `shouldPaintCollapsed` for run members, merged parts `Ran N commands: a, b +K more` with the summed duration as the metric) with disjoint membership from the inspect track — verify new `test/burst.test.ts` cases: three sub-second runs merge; a 2s run keeps its own row and closes the burst; assistant text closes it; a failed run is excluded but does not close it; `N === 1` falls back to the single-run form.
- [x] 5.2 Wire the run track through `src/tools.ts` (`bash` sends its settled seconds, its title, and its invalidator) and keep a merged line owned by the first covered run — verify `test/tools.test.ts` asserts the merged line's position, its duration metric, and that `Ctrl+O` unmerges into one row per run.
- [x] 5.3 Verify the two merge families never contaminate each other: an inspect burst is split by a bash row that keeps its own line, and a run merge never absorbs inspect counts — verify the split tests in `test/burst.test.ts` and the inspect merge tests in `test/tools.test.ts` both pass.

## 6. Errors and paths

- [x] 6.1 Switch error rows to the `×` marker, keep the `error` color and the bold marker/name/status, and move the exit code or error text into the metric column — verify `test/tools.test.ts` and `test/rows.test.ts` assert `×` and a right-aligned `exit 2`.
- [x] 6.2 Replace right truncation with `elideMiddle(path, max)` for collapsed rows and for foreign-row titles, keeping the basename and extension — verify new `test/summaries.test.ts` cases: a deep path keeps `file.ts`, a basename longer than the budget truncates from the left, and a short path is untouched.
- [x] 6.3 Stop printing absolute paths for expanded rows inside the session cwd or the home directory, delete the now-unused `absolutePath` helper and its tests, and widen the budget for expanded rows — verify `test/summaries.test.ts` and `test/tools.test.ts` assert a cwd-relative and a `~`-prefixed expanded path.

## 7. Theme and the running-row cue

- [x] 7.1 Re-space the foreground ladder in `themes/quiet.json` (`text` explicit, `toolOutput`, `muted`, `dim`) and separate `error` from `toolDiffRemoved` by luminance — verify `test/theme-json.test.ts` asserts the five values are distinct and that `text` is not the empty string.
- [x] 7.2 Draw a running row's title from the brighter `text` slot while a settled row's stays `dim` — verify `test/emphasis.test.ts` asserts the difference for the same row in both states.
- [ ] 7.3 Check the palette on a real dark terminal: prose / output / dim chrome read as three steps, the diff colors and the error color stay apart in grayscale, and no spinner is the brightest element — record the observed result (terminal, pass or adjusted values) in the change's notes; adjust hexes within the same ladder if needed.

## 8. Docs, evidence, and wrap-up

- [ ] 8.1 Update `README.md` and re-record the demo so the recorded session shows the new shapes (gutter, no sub-second clocks, light thinking label, metric column) — verify the recording contains no `0.0s` clock, no `◆ Thought`, and no `◆` on a failed row.
- [ ] 8.2 Re-run the manual verification tasks of the five in-flight changes (`quiet-tui-coverage` 3.3, `-emphasis` 3.3, `-live-glyph` 3.4, `-prompt-marker` 3.3, `-questionnaire` 3.3) against the new row shapes and check them off — verify each task's description still describes what the screen shows, or is amended with the new shape.
- [ ] 8.3 Full-session smoke test in a 80-column terminal: a turn with a burst of reads, three quick runs, one slow run, an `edit`, a failure, thinking, and a questionnaire — verify no row shifts height while running, no transcript flash, `Ctrl+O` expands and restores every row, and the transcript is idle (no timer) once the turn ends.
- [x] 8.4 Run `npm test` and `openspec validate quiet-tui-visual-hierarchy` — verify the suite passes with the updated counts recorded, and validation reports no errors (recorded: 256 tests / 48 suites passing, `openspec validate --strict` valid).
