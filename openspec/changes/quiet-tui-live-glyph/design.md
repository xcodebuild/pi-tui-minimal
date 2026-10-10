## Context

See `proposal.md` — Why. What shapes the approach:

- The rows are plain strings produced by `src/summaries.ts` and styled by `src/emphasis.ts`, which parses the leading `◆` back off before it styles the body. Both are covered by tests that assert text.
- pi owns the repaint of a partial tool row: nothing on screen ticks unless a row asks for it (`ToolRenderContext.invalidate`). A glyph that never invalidates is a glyph that freezes on whatever frame the row was rendered at.
- Two families of rows exist. Rows this extension registers render through `renderCall`/`renderResult` and get an `invalidate`. Rows it does not (the questionnaire, FFF) are substituted inside the transcript container patch (`src/spacing.ts`), which has no per-row handle — but pi already repaints that container while a turn is in flight, because its own working indicator is an animated `Loader`.
- Thinking labels are not components at all: they are Markdown source returned by a transformer, re-run only when the text or the width changes.

## Goals / Non-Goals

**Goals:**
- "Still running" and "done" distinguishable at a glance, across every row that can be running, with no reading of the trailing text.
- The marker stays one column wide, so a spinning row cannot change the row's width or height.
- `summaries.ts` stays plain text and stays asserted as text.
- No timer outlives the work: a settled transcript is exactly as cheap as before.

**Non-Goals:**
- Animating anything that is settled, or anything that has no width to spare.
- A frame-set or interval knob.
- Touching what a row says, what the model sees, or what the session stores.
- Reaching into rows this extension cannot own; the patched rows ride pi's repaint loop and nothing more.

## Decisions

**The frame is a pure function of the clock, not a counter.**
`liveGlyph(now, intervalMs)` steps through the frames with `Math.floor(now / intervalMs) % 10`. Two rows rendered in the same frame therefore cannot show different frames, a caller with no row state can spin the same way, and tests get a deterministic glyph by freezing the clock instead of stepping an internal counter. *Alternative rejected:* a shared mutable frame index — every renderer would have to agree on when the index advances, and a row that renders once would drift out of step with the rest.

**The glyph replaces `◆` instead of preceding it.**
`⠋ Run …` and `◆ Ran …` differ by mark rather than by mark plus decoration, which keeps the single-column anchor the emphasis contract already promises. The emphasis layer already parsed one leading marker; it now accepts a live frame as the same token and paints it bold in `warning` while `◆` stays bold in `accent`. *Alternative rejected:* `⠋ ◆ Run …` — two symbols of chrome on a row that is supposed to read as quietly as the ones above it, and the settled form would still need a rule for which glyph survives.

**One shared repaint loop, keyed by the row's own state.**
`createLiveGlyphs` keeps a `Set` of watchers and one interval; each partial render hands in its `invalidate`, and a settled render releases it, which stops the interval when the last row goes away. Keying on `context.state` (the object pi shares between a row's call and result renderers) makes registration idempotent, so a row that renders twice in a frame still holds one watcher. The watcher stores the *latest* `invalidate` closure rather than the first, because a re-render may hand in a fresh one. *Alternative rejected:* one timer per row — an inspect burst of 46 rows would then own 46 timers, and each would stop only on its own schedule.

**Thinking animates on the ticks it already gets.**
The label is Markdown source, and pi re-runs the transformer only when the text changes, so the frame advances with the token count while thinking streams and freezes with it. That is the honest behaviour for a row whose only other movement is the count, and it needs no invalidate path the transformer context does not have. The `liveMarker` option keeps the seam testable and keeps `thinkingStream`'s default output plain text (`◆`) for callers that assert it.

**Patched rows take a frame, not a timer.**
`patchContainer` gained a `liveMarker` source and passes the frame it reads to the questionnaire and foreign-row builders. Those rows have no `invalidate` of their own, but pi repaints the transcript container on every working-indicator frame while a turn runs, so the glyph moves anyway — and a session that is idle costs nothing. *Alternative rejected:* creating a second ticker inside the patch — it would have to reach into pi's `ToolExecutionComponent` to invalidate, and would run even when nothing on screen is animating.

## Risks / Trade-offs

- [The 100ms invalidate makes a big transcript repaint more often than the 1s run clock did] → pi's own working indicator already animates at a comparable cadence for the whole turn, and the extra invalidation coalesces into those frames; the interval is `unref`ed and stops with the last running row.
- [A row that is partial when its renderer stops being called would keep the ticker alive] → every renderer (call and result) calls the shared `marker` helper on every render, so a row releases on the first settled render of either half; the same shape the existing run clock already relies on.
- [A frame read at paint time could look jerky on the patched rows] → they advance with pi's repaint cadence, which is the same order of magnitude as the frame interval; a jerky spin is still legible as "running", which is the whole job.
- [A live glyph in the row text could be mistaken for content by the emphasis parser] → the frames are one-column braille glyphs followed by a space, which no path, title, or command in a row starts with; the parser falls back to "no marker, add `◆`" for anything it does not recognise, and the tests pin a live glyph, a settled glyph, and an unmarked row.
- [`warning` is the only colour the live marker uses] → a theme that maps `warning` near its `accent` still separates the two by glyph, so the cue degrades to shape rather than disappearing.
- [A terminal without braille coverage shows a box] → the frames are single-column and the row's layout is unaffected; the fallback is an ugly glyph, not a broken row.

## Migration Plan

Display-only and self-contained: no data, config, or API migration. Rollback is removing `src/live.ts` and passing no marker, which restores the constant `◆` on every row.

## Open Questions

None.
