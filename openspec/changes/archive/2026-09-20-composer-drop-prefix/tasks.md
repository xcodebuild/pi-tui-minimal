## 1. Drop the prefix from the composer

- [x] 1.1 Remove `PREFIX` and `applyComposerChrome` from `src/composer.ts`; reduce `QuietEditor` to a `CustomEditor` subclass whose constructor hands the dim `colorize` in as `theme.borderColor` and overrides `render` nowhere — and verify `test/composer.test.ts` no longer imports the deleted function
- [x] 1.2 Keep `chrome.ts` unchanged (`ctx.ui.theme.fg("dim")` still supplies the rule color) — and verify `test/chrome.test.ts` stays green without edits

## 2. Prove the render output is pi's

- [x] 2.1 Add a test that builds a `QuietEditor` with a stub TUI and asserts no rendered line starts with `>` while the typed text is still visible — and verify it fails if a prefix is re-added
- [x] 2.2 Add a test that renders more lines than the visible area allows and asserts the top/bottom rules still contain `↑ … more` / `↓ … more` — and verify it fails on the old `replace(/[^-─]/g, "─")` pass
- [x] 2.3 Add a test that renders a stock `CustomEditor` on the same stub TUI, theme, and width and asserts the output equals `QuietEditor`'s line for line, plus one asserting the rules carry the injected dim colorizer

## 3. Sync docs and spec

- [x] 3.1 `openspec/specs/quiet-tui/spec.md`: apply the delta — the composer scenario drops the prefix allowance, gains "Composer keeps pi’s editor lines intact", and gains "Autocomplete list is not prefixed"
- [x] 3.2 Update the stale prefix allowance in `openspec/changes/quiet-tui-emphasis/specs/quiet-tui/spec.md` so archiving that change later cannot restore the old wording
- [x] 3.3 Update `README.md`: the composer bullet no longer claims a dim `>` prefix, and the "What you see" / notes text names dim rules as the only composer chrome
- [x] 3.4 Run `npm test` and `openspec validate composer-drop-prefix --strict` and confirm both are green
- [ ] 3.5 Load the extension in a real session and verify: no `>` at the start of the input, the slash-command list shows only pi's `→`, and a scrolled multi-line input still shows the `↑ N more` indicator
