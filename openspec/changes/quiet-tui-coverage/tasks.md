## 1. Make the theme patch apply

- [x] 1.1 Rewrite `applyThemePatch` in `src/theme.ts` to resolve the live theme by name (`ui.theme.name` → `ui.getTheme(name)`), clone it with `Object.create(Object.getPrototypeOf(live))` + `Object.assign`, and install the clone with `ui.setTheme(clone)` — and verify a unit test asserts the installed object passes `instanceof` the fake `Theme` class
- [x] 1.2 Override `bg` on the clone so the five fill slots return the text unchanged while other slots still delegate to the original instance, and override `fg` so `thinkingText` resolves to `dim` while every other slot is unchanged — and verify the test covers a filled slot, a non-filled slot, `thinkingText`, and an untouched slot
- [x] 1.3 Fall back to `ui.setTheme("quiet")` when the active theme cannot be resolved by name, instead of silently doing nothing — and verify a test with a nameless/unknown theme asserts the fallback call
- [x] 1.4 Keep `Object.create` cloning faithful to pi's `Theme` (plain own fields `name` / `sourcePath` / `sourceInfo` / `fgColors` / `bgColors` / `mode`) — and verify the test's fake `Theme` uses the same shape so a regression in the copy shows up as a failing test

## 2. Thinking joins the diamond/dim family

- [x] 2.1 Add the diamond strings to `src/summaries.ts` (`◆ Thinking` header, `◆ Thought for Xs`, `◆ Thought` for an unknown duration) and update `src/thinking.ts`'s transformer to emit the header plus the 3 tail lines indented by two spaces while streaming — and verify `test/thinking.test.ts` covers the header, the indent staying under Markdown's 4-space code-block threshold, and the tail cap
- [x] 2.2 Return the diamond summary when the run is final and keep `◆ Thought` for a restored run — and verify the duration label, the restored label, and non-thinking markdown passthrough in the same test file
- [x] 2.3 Set the hidden-thinking label to the diamond strings at `session_start` and on `message_end`, keeping the once-per-session Hide-thinking warning — and verify a test asserts the label strings and that a non-UI context makes no UI calls
- [x] 2.4 Set `"thinkingText": "dimGray"` in `themes/quiet.json` so the fallback theme matches the runtime remap — and verify `test/theme-json.test.ts` still passes with the shipped theme

## 3. Verify and document

- [x] 3.1 Run `npm test` and confirm every suite is green, including the pre-existing burst, composer, diff, and tools suites
- [x] 3.2 Update `README.md`: thinking renders as `◆ Thinking` + 3 dim lines and collapses to `◆ Thought for Xs` (italic kept, because pi styles that block itself); fill bands now actually cleared on the active theme; a theme switch after load drops the patch until reload; tools registered by other extensions keep their own rendering and are out of scope
- [ ] 3.3 Load the extension in a real interactive session and verify: no fill band behind tool rows, user turns, or custom messages; thinking shows the `◆ Thinking` header and dim tail then collapses to `◆ Thought for Xs`; a burst of reads still merges into one summary line; and a subagent or fff tool row renders exactly as it did before, minus its background
