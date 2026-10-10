## Why

Every row in the quiet transcript opens with the same `◆`, whether it is finished or still going. The only cue that work is in flight is a piece of trailing text — the ` for 2.1s` clock on a run row — and the longest-running row of all, the thinking label, has no clock of its own to give it away. So a transcript mid-turn reads exactly like a transcript that has stopped: a wall of identical markers, with no way to see at a glance what is still moving and what has settled.

## What Changes

- Add a live marker (`src/live.ts`): ten one-column frames (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`), a `liveGlyph(now)` that is a pure function of the clock, and a shared repaint loop that invalidates every running row on one 100ms timer.
- Every row that is still running now wears the live glyph **in place of** `◆`: a `Run …` header (collapsed and expanded), a running `read`/`ls`/`grep`/`find` header, a streaming `write`/`edit`, the thinking label, a pending questionnaire (`⠋ Asking …`), and a running FFF row on the merge path. A settled row keeps `◆`; an error row always shows `◆`, because it has already settled.
- The live glyph is the one row anchor that is not accent-coloured: it is bold in the theme's `warning` slot, so running and settled differ by colour as well as by shape. The tracked formatters in `summaries.ts` take an optional `marker` (default `◆`), and `src/emphasis.ts` parses a leading live frame exactly as it parses `◆`.
- The shared ticker is keyed by the row's own renderer state: a row registers its `invalidate` while it is partial and is released when it settles, so a long inspect burst, a streaming write and the thinking label move on the same beat for one timer, and a finished transcript costs none.
- Rows this extension does not register — the questionnaire and the FFF tools, substituted inside the transcript patch — spin too, without a timer of their own: the frame is read at paint time and pi already repaints the container while a turn runs.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `quiet-tui`: the marker becomes stateful. "Row emphasis uses accent and weight" learns that a running row's marker is the live glyph in the `warning` slot; "Thinking streams inline in the transcript then collapses in place", "Non-mutation tools stream then collapse", "Consecutive inspect tools merge into one summary line" and "Write and edit report the size of the change while streaming" each gain the live marker while their row is running, and the settled form stays `◆`.

## Impact

- New `src/live.ts`; `src/summaries.ts` (`marker` parameters on the running-row formatters), `src/emphasis.ts` (the marker grammar and its two colours), `src/tools.ts` (every partial renderer registers its row and passes its marker), `src/thinking.ts` (`liveMarker` seam on the streaming label), `src/rows.ts` + `src/questionnaire.ts` + `src/spacing.ts` (the patched rows take a frame), plus their tests and `test/live.test.ts`.
- Display-only: the glyph lives in what pi renders. It is not part of the tool result, the session file, or the model context, and print/RPC modes are untouched.
- Cost: one `unref`ed 100ms interval while at least one row is running; pi already repaints at a comparable cadence for its own working indicator, and the extension's invalidations coalesce into those frames.
- Out of scope: an animated glyph on rows that settle instantly (there is nothing to spin), a configurable frame set or interval, and any change to what a running row *says*. The user-typed shell row (`!command`) keeps pi’s own runner untouched, as the existing user-typed-shell requirement says, and pi’s working indicator below the editor is already animated by pi itself.
