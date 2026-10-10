## 1. The live marker

- [x] 1.1 Add `src/live.ts`: `LIVE_FRAMES` (ten one-column frames), `LIVE_INTERVAL_MS`, `isLiveGlyph`, `liveGlyph(now, intervalMs)` as a pure function of the clock, and `createLiveGlyphs()` — a `Set` of watchers, one interval, idempotent registration per row `state`, release on settle, `unref`ed timer — and verify `test/live.test.ts` asserts the frame per interval and the wrap, the one-watcher-per-row rule, the shared repaint of two rows, the stop when the last row settles, the latest-`invalidate` rule, and the stateless `frame()` path
- [x] 1.2 Give the running-row formatters an optional `marker` defaulting to `◆` (`formatRunLine`, `formatRunFull`, `formatThinkingLive`, `formatWriteLines`, `formatEditCounts`), so `summaries.ts` stays plain text — and verify `test/summaries.test.ts` still asserts the `◆` form with no marker passed
- [x] 1.3 Make the emphasis layer parse a live frame as a marker and paint it bold in `warning` while `◆` stays bold in `accent`, and force `◆` back onto an error row — and verify `test/emphasis.test.ts` asserts the warning-bold live glyph on a run row, an inspect row and a streaming thinking label, a bare glyph, and an error row handed a live glyph

## 2. Every running row wears it

- [x] 2.1 Thread a shared `LiveGlyphs` through `createQuietTools`/`registerQuietTools` and have every partial renderer call one `rowMarker` helper on every render, so the marker advances while the row runs and the watcher is released when it settles: `bash` (collapsed and expanded `Run …`), `read`/`ls`/`grep`/`find` (running header), `edit` and `write` (streaming header) — and verify `test/tools.test.ts` asserts `⠋ Run …` while running, `◆ Ran …` after, the running inspect header, and the streaming write/edit headers with a pinned frame
- [x] 2.2 Give the thinking controller a `liveMarker` option (defaulting to the wall-clock frame) and pass it into `thinkingStream`, whose `marker` parameter defaults to `◆` — and verify `test/thinking.test.ts` asserts the pinned `⠋ Thinking 100 tokens for 1.5s` while streaming and `◆ Thought …` once the run ends, and the styled warning-bold label
- [x] 2.3 Pass a frame into the patched rows (`patchContainer` → `questionnaireRowLines` / `foreignToolRowLines`, both defaulting to `◆`) so a pending questionnaire and a running FFF row spin without a timer of their own, and add a `liveMarker` seam to `createSpacing` — and verify `test/questionnaire.test.ts`, `test/rows.test.ts` (direct and through pi's real component) assert the pending/running form and that a settled row keeps `◆`
- [x] 2.4 Add the pinned-frame fixture (`LIVE`, `fixedLive`) to `test/fake-theme.ts` so every row test can assert a live row as text instead of a clock-dependent frame

## 3. Verify and document

- [x] 3.1 Run `npm test` and confirm every suite is green (205 tests), including the pre-existing burst, composer, diff, theme, spacing and extension suites
- [x] 3.2 Confirm the typecheck baseline is unchanged (`npx tsc --noEmit` reports the same pre-existing errors as before the change)
- [x] 3.3 Write the change up: `proposal.md`, `design.md`, `tasks.md`, and the `quiet-tui` spec delta
- [ ] 3.4 Load the extension in a real interactive session and verify: a run row spins `⠋ Run … for 2.1s` and returns to `◆ Ran …` when it finishes; a streaming write/edit spins and settles to `◆`; thinking spins under `⠋ Thinking 1,234 tokens` and collapses to `◆ Thought …`; a pending `ask_user_question` row shows `⠋ Asking …` and settles to `◆ Asked …`; a failed run stays `◆ … exit N` in the error colour; and the transcript is idle (no timer, no repaints) once the turn ends
