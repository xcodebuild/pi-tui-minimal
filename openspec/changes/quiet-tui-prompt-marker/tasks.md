## 1. Give the prompt its marker

- [x] 1.1 Split the line-level escape helpers out of `spacing.ts` into `src/ansi.ts` (`visibleText`, `escapesOf`, `isBlankLine`, and a new `linePrefix` that walks a line's leading escapes and padding in any order) and re-export the original three from `spacing.ts` so existing imports keep working — and verify `test/spacing.test.ts` still asserts blank/escape measurement unchanged
- [x] 1.2 Add `src/prompt.ts`: `isPromptRow` (`text` + `outputPad` + `markdownTransformers`, and neither `contentContainer` nor `toolCallId`) and `promptLines(component, lines, theme, width)`, which marks the first line carrying text, spends up to two of that line's padding columns on the marker, re-emits the escapes it walked past, and tops up a shortfall from the trailing filler — and verify `test/prompt.test.ts` asserts the marker string, the width conservation, the escape re-emit, the pi-shaped `bg(…)`-wrapped line, and the no-ops
- [x] 1.3 Add the glyph and its styling where the other markers live: `PROMPT` in `src/summaries.ts`, `emphasizePromptMarker` in `src/emphasis.ts` (accent + bold + gap) — and verify `test/prompt.test.ts` asserts the accent/bold form through `markerTheme`

## 2. Wire it into the transcript patch

- [x] 2.1 Splice the marker in `patchContainer` ahead of the row substitutions, and keep it out of the `wrapTextWithAnsi` path the rebuilt rows take — and verify `test/spacing.test.ts` asserts the marked prompt's line, the untouched blank lines above and below it, and `mouseLayout` heights unchanged
- [x] 2.2 Let a prompt anchor `findTranscriptContainer` (via a new `isTranscriptAnchor`, so `isAgentOutput` and `tightenChild` semantics do not change), so a turn with no output yet still gets its marker — and verify the real-`UserMessageComponent` test renders `❯ …` with the same line count as before

## 3. Verify and document

- [x] 3.1 Run `npm test` and confirm every suite is green (174 tests, including the real-component prompt row and the container patch)
- [x] 3.2 Update `README.md`: the prompt carries one accented `❯`, paid for by its own padding, and the background band is still gone
- [ ] 3.3 Load the extension in a real interactive session and verify: a submitted prompt shows `❯` immediately (before the reply starts), a prompt with a wrapped second line does not overflow or gain a row, an aborted turn still shows the marker, and `Ctrl+O`/click expansion of surrounding rows still lands on the right lines
