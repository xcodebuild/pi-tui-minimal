## Context

`quiet-tui` strips pi's filled background bands (`theme.ts`, `FILL_BG_SLOTS`), and the user's prompt is the block where the band carried the most information: pi renders it as `new Box(outputPad, 1, content => theme.bg("userMessageBg", content))`, so losing the band means losing the only thing that distinguished a prompt from the prose above it.

The extension already owns one lever that reaches pi's own components: the transcript container patch (`spacing.ts`), which walks the live tree the editor factory hands out, then drops the leading blank from agent-output children and substitutes the rows pi renders for itself. The marker could have been built with any of three levers, so the choice is recorded here.

## Goals / Non-Goals

**Goals**

- One accented marker on the prompt's first text line, so a scroll-through finds the user's turns.
- Zero geometry change: same line count, no line wider than the width, no change to `mouseLayout`, click routing, or `Ctrl+O` expansion.
- Zero change to what pi rendered inside the prompt: its Markdown, its tables, its code blocks, its wraps.
- Degrade to pi's own rendering when the component shape is not recognised.

**Non-Goals**

- Bringing the background band back (`FILL_BG_SLOTS` still strips `userMessageBg`).
- Touching the composer: `QuietEditor` keeps its dim rules and no prefix; the marker is a transcript row, not an input prompt.
- Marking anything else — assistant replies and tool rows keep the `◆` family.

## Decisions

### Decision: splice into the rendered lines, do not rebuild the row

`questionnaire.ts` and `rows.ts` *rebuild* a row's lines from the component's own data, because those rows are pi's generic fallback and have no rendering worth keeping. A prompt is the opposite: pi renders it through `Markdown`, and a rebuild would have to re-implement wrapping, tables, and code blocks. So `prompt.ts` receives the lines the patch already sliced and rewrites exactly one of them.

*Alternative rejected:* a markdown transformer for `messageType === "user"` (pi's public API, no internals at all). It rewrites the *source* the renderer parses, so a prefix would have to survive Markdown: `> ` would turn the prompt into a blockquote (pi draws its own rule, and a list or a fence inside a quote re-parses differently), a leading `---` would add a full-width rule plus a blank line (two extra rows per turn), and any prefix would shift the wrap column of the whole prompt. The splice touches one line and nothing else.

### Decision: the padding pays for the marker

pi wraps the *whole padded line* in its background, so a prompt line opens with `bg(…)`, then its padding spaces, then `fg(…)`, then the text. `linePrefix` in `ansi.ts` walks that run — escapes and spaces in whatever order — and reports the escapes, the padding columns, and the rest. The marker spends up to its own two columns of that padding and is spliced in *before* the escapes (which are re-emitted) so the text keeps the colour pi opened; `fg` closing with a `39m` reset is why the re-emit is required.

A shortfall is taken off the row's trailing filler (`truncateToWidth`) rather than by dropping content: `Markdown` wraps a prompt to `width - 2`, and the box pads the line back out to `width`, so there are always at least two blank columns to take.

*Alternatives rejected:* prefixing without stealing (`visibleWidth` grows, the TUI clips or wraps the row), and stealing from every line (that would rewrite the prompt's wraps and could break a table row).

### Decision: one glyph, not a rule

A full-width rule above the prompt (replacing pi's blank padding line) and a left rule down the whole prompt were both prototyped as mockups. The rule reads as chrome around the turn and costs either a column of every line or a re-wrap of the prompt; one `❯` on the first line is the smallest thing that answers "where does my turn start", and it matches the glyph family the rest of the transcript uses.

### Decision: anchor the transcript search on the prompt too

`findTranscriptContainer` used to require agent output (a tool row or an assistant message), so a turn whose first output had not arrived — or that the user aborted before any output, which is exactly what prompted this change — had no patch installed and therefore no marker. A prompt is now a valid anchor. It is added as `isTranscriptAnchor`, deliberately *not* by widening `isAgentOutput`: that predicate also decides which children lose their leading blank (`tightenChild`), and a prompt must keep its blanks.

## Risks / Trade-offs

- **pi internals.** The marker keys off `UserMessageComponent`'s fields (`text`, `outputPad`, `markdownTransformers`, no `contentContainer`, no `toolCallId`). A pi release that renames them makes `isPromptRow` return false and the prompt renders as pi drew it; the real-component test (`test/spacing.test.ts`, "marks the real prompt row") fails first, which is the signal.
- **Column arithmetic.** The marker is placed by visible width, so an ambiguous-width `❯` on a terminal that renders it double-wide leaves the row one column short — the same assumption `◆` rows already make.
- **Wrapped prompts.** Continuation lines keep pi's own indentation, so they start one column left of the marked line's text. Accepted: rewriting them would mean re-wrapping the prompt.
