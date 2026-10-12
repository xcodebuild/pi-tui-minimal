# Notes

Evidence gathered while implementing this change, and the checks that still need a human at a
terminal. Nothing here is a specification; the specs are in `specs/quiet-tui/spec.md`.

## Palette (task 7.3)

`themes/quiet.json` was re-spaced so prose, captured output and dim chrome are three visible
steps. Measured on the theme JSON's own values, against a `#1e1e1e` background, with WCAG
relative luminance (`grey` is luminance × 255, so the steps can be compared by eye):

| role | slot | value | grey | contrast |
| --- | --- | --- | --- | --- |
| assistant prose | `text` | `#d8d8d8` | 175 | 11.70:1 |
| expanded output | `toolOutput` | `#a0a0a0` | 90 | 6.38:1 |
| secondary chrome | `muted` | `#8a8a8a` | 65 | 4.83:1 |
| row tails, metric column | `dim` / `thinkingText` | `#6b6b6b` | 37 | 3.13:1 |
| added lines | `toolDiffAdded` | `#b5bd68` | 120 | 8.29:1 |
| removed lines | `toolDiffRemoved` | `#b05252` | 40 | 3.31:1 |
| failures | `error` | `#ff6b6b` | 84 | 6.01:1 |
| markers | `accent` | `#8abeb7` | 116 | 8.04:1 |
| pi's warnings | `warning` | `#ffff00` | 237 | 15.52:1 |

- The three foreground steps are ≥ 0.1 luminance apart, which is what `theme-json.test.ts` asserts.
- `toolDiffAdded` (120) / `toolDiffRemoved` (40) / `error` (84) are ≥ 30 greyscale steps apart, so
  a diff still reads as a diff without colour. Before this change `error` and `toolDiffRemoved`
  were the same hex (`#cc6666`), which made the grayscale case unsatisfiable.
- `warning` is no longer used by any row: the live glyph (the loudest, constantly moving element
  on screen) is drawn from `accent`, and a running row is marked by its **brighter text** instead
  (`emphasis.ts`). The pure yellow is left to pi's own warnings.

Still to confirm on a real terminal (task 8.3): that the steps read as three distinct levels at
a glance, and that no spinner is the brightest thing on screen.

## Layout preview

A layout-only preview of a representative turn (identity styling, 80 columns, `|` marks the
right edge). Rendered through the same renderers the transcript uses, by driving
`createQuietTools` / `foreignToolRow` / `questionnaireRow` / `thinkingStream` directly:

```
  ◆ Read src/tools.ts, src/render.ts +1 more, Searched 2 patterns               |
  ◆ Ran 3 commands: Check repo state, Run the test suite +1 more        1.2s    |
  ◆ Ran Run the whole suite                                             2.4s    |
  ◆ Edit src/render.ts                                              −1 +1       |
  +  const step = layoutRow(parts, width);                                      |
  -  return headerLine(theme, text);                                            |
  ◆ ffgrep /useEffect/ in src                                                   |
  src/a.ts                                                                      |
  src/b.ts                                                                      |
  ◆ Asked UI 框架, 补丁范围                                                     |
  × Run Search the cast                                                   exit 2|
  · Thinking 1,289 tokens                                                   2.4s|
```

Read from the `pi-report-demo.cast` recording that motivated the change (38 rows: 16 `Thought`,
18 `Ran/Run`, 19 carrying a sub-second clock), this is the difference the change is after: the
gutter separates machinery from prose, the clocks and counts line up in one column instead of
landing wherever the title ends, `×` says failure before the colour does, and the thinking label
no longer competes with the rows around it.

## Checks that still need a terminal

These are the tasks left unchecked, and they need a real interactive session rather than the
headless test suite:

- **7.3** — the palette as it actually renders (see above for the measurements).
- **8.1** — re-recording `pi-report-demo.cast` (it is gitignored; the README needs no change, it
  documents only install and links the cast).
- **8.2** — the five in-flight changes' manual verification tasks (`quiet-tui-coverage` 3.3,
  `-emphasis` 3.3, `-live-glyph` 3.4, `-prompt-marker` 3.3, `-questionnaire` 3.3). Their
  descriptions name the old row shapes (`◆ Thought`, `for 0.0s`, a `◆` on a failed row), so they
  need re-reading against the new ones before they are ticked.
- **8.3** — the smoke test: a turn with an inspect burst, three quick runs, one slow run, an
  `edit`, a failure, thinking, and a questionnaire, in an 80-column terminal.
