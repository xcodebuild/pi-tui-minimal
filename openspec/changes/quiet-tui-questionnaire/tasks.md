## 1. Replace the row

- [x] 1.1 Add `src/questionnaire.ts`: `isQuestionnaireRow` (tool name + `updateResult` shape), plain-text formatters (`headerLabel`, `formatAsking`, `formatAsked`, `formatDeclined`, `answerValue`, `formatAnswerLine`) and `questionnaireRowLines(component, theme)` returning the pending, answered, declined, failed, and expanded line sets — and verify `test/questionnaire.test.ts` asserts each string, the `(no input)` and multi-value answer forms, and the chip fallback to a question count
- [x] 1.2 Teach `patchContainer` to substitute a row's lines: read the theme from a `getTheme` callback, replace the tightened lines when `questionnaireRowLines` returns some, carry the dropped line's escapes onto the replacement, wrap every substituted line with `wrapTextWithAnsi(line, width)`, and repair `mouseLayout`/click offsets from the final length — and verify the container test asserts one rendered line, the click offset landing on the row's own content, and `visibleWidth(line) <= width`
- [x] 1.3 Leave every other row alone — and verify a `bash` row rendered through the same patched container comes back unchanged

## 2. Wire it up

- [x] 2.1 Add `Spacing.attachTheme(theme)` and pass it the live theme (`ctx.ui.theme`) from `applyQuietChrome`, reading it per render so the patched clone installed by `applyThemePatch` is what styles the row — and verify `test/chrome.test.ts` asserts the theme reaches the spacing handle
- [x] 2.2 End inspect bursts on the questionnaire: add the tool name to `isBurstSplitTool` and use that predicate for both the row-render and `tool_execution_start` split paths in `src/tools.ts` — and verify `test/burst.test.ts` covers the questionnaire and a non-split tool

## 3. Verify and document

- [x] 3.1 Run `npm test` and confirm every suite is green, including the new real-`ToolExecutionComponent` suite (pending → answered → expanded against pi's own component)
- [x] 3.2 Update `README.md`: the questionnaire row is one `◆` line in every state with a structured expanded view, `ask_user_question` joins the covered rows, and the other third-party rows still keep their own rendering, plus the note that the row is substituted inside the container patch and wrapped there
- [ ] 3.3 Load the extension in a real interactive session and verify: a questionnaire row reads `◆ Asking …` while the overlay is open and `◆ Asked …` after answering, `Ctrl+O` lists chip/answer pairs (and notes), a declined questionnaire reads `declined`, reads on either side of the questionnaire do not merge into one summary line, and the overlay itself renders as before
