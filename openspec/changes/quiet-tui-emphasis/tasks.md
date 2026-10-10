## 1. Emphasis layer

- [x] 1.1 Add `src/emphasis.ts` (`EmphasisTheme`, `emphasizeHeader`, `emphasizeError`, `emphasizeThinkingLabel`) that re-parses the canonical row shapes — `◆ Run …`, the merge grammar `Read 46 files, Listed 3 dirs`, `◆ src/a.ts  +12 −3`, `◆ edit src/a.ts`, expanded `grep …`, `◆ Thought for 0.4s` — and falls back to "accent the first word, dim the rest" for anything else — verify `test/emphasis.test.ts` asserts the exact styled string for each shape, the unmarked-row form, the bare `◆`, and the fallback
- [x] 1.2 Route `headerLine` and `errorLine` in `src/render.ts` through the emphasis layer instead of a single `fg("dim", …)` / `fg("error", …)` — verify the emphasis block in `test/tools.test.ts` renders a `bash` row, a merged inspect row, and an expanded `edit` row through `headerLine` with a marker theme and asserts the accent and bold spans, while the rest of the suite still passes with the identity `fakeTheme`
- [x] 1.3 Add the `markerTheme` fixture (`fg` → `[color]…[/]`, `bold` → `<b>…</b>`) to `test/fake-theme.ts` so the assertable form of a styled row exists in one place — verify `test/emphasis.test.ts` and `test/tools.test.ts` both import it

## 2. Thinking labels join the accent

- [x] 2.1 Give `thinkingStream` an optional `styleLabel` parameter and `createThinkingController` a `styleLabel` option defaulting to identity, and capture the session theme at `session_start` (`ctx.ui.theme`, which by then is the patched clone) — verify existing transformer tests still read the plain `◆ Thinking` / `◆ Thought` strings with no override, and `test/thinking.test.ts` asserts the styled form, the missing-`bold` theme, and the override seam
- [x] 2.2 In `emphasizeThinkingLabel`, re-open `thinkingText` before the text that follows the accented span, so ` for 0.4s` keeps the thinking color instead of falling back to the terminal default — verify `test/emphasis.test.ts` renders the label through pi-tui's real `Markdown` component with pi's thinking `defaultTextStyle` and asserts the accent span, the re-opened color, and the tail-line color
- [x] 2.3 Apply the same styler to the hidden-thinking label set at `session_start` and on `message_end` — verify `test/extension.test.ts` drives the real `session_start` handler and asserts the installed theme (fill slots cleared, `thinkingText` → `dim`, selection band kept), the hidden label, the streaming transform, and the collapsed label's re-opened color

## 3. Verify and document

- [x] 3.1 Run `npm test` and confirm every suite is green (102 tests), including the pre-existing burst, composer, diff, theme, and tools suites
- [x] 3.2 Update `README.md`: the weight-and-accent contract in "What you see", the accented thinking labels, and a note that the labels are styled by putting ANSI into the Markdown pi only displays, with the reason the trailing duration re-opens the thinking color
- [ ] 3.3 Load the extension in a real interactive session and verify: a `Run …` row leads with an accented bold `◆ Run`; a burst of reads merges into one line with accented kind names and bold counts; an `edit` row bolds the path and the `+N/−M` counts; a failed run stays red with a bold `exit N`; thinking streams under an accented `◆ Thinking` and collapses to `◆ Thought for Xs` with a dim duration; and a tool registered by another extension still renders exactly as before
