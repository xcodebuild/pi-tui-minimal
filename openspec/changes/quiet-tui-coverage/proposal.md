## Why

Two things keep the quiet transcript from looking like one style. First, a defect: `applyThemePatch` writes to `ctx.ui.theme`, but pi exposes the theme as `new Proxy({}, { get })` — **only a `get` trap** — so `theme.bg = …` lands on the proxy's empty target and every read keeps returning the real `Theme` instance's method. The fill-slot stripping therefore never takes effect, and tool rows, user messages, and custom messages still paint `toolPendingBg` / `toolSuccessBg` / `toolErrorBg` / `userMessageBg` / `customMessageBg` bands in a real session. Second, thinking is rendered by pi as an unmarked italic `thinkingText` block, so even once the bands are gone it still reads as a different family from the `◆` dim tool lines.

## What Changes

- Fix the theme patch so it actually applies: resolve the live `Theme` instance through `ctx.ui.theme.name` + `ctx.ui.getTheme(name)`, clone it (`Object.create` on its prototype, so `ui.setTheme` still accepts it as a `Theme`), override `bg` (fill slots → no background) and `fg` (`thinkingText` → `dim`) on the clone, and install it with `ctx.ui.setTheme`. The existing `setTheme("quiet")` path becomes the fallback for a theme the user layer cannot resolve by name.
- Bring thinking into the `◆` dim family through the markdown transformer: while streaming it shows a `◆ Thinking` header followed by at most 3 tail lines, and it collapses in place to `◆ Thought for 1.2s` (`◆ Thought` for restored runs). The hidden-thinking label uses the same diamond strings. pi's italic on thinking is kept.
- Set `thinkingText` to the dim color in the shipped fallback theme so both theme paths agree.

## Capabilities

### New Capabilities

- (none)

### Modified Capabilities

- `quiet-tui`: the thinking requirement gains a style contract (diamond-prefixed, dim, tail lines under a header). The no-fill requirement is unchanged in wording — its observable outcome was never delivered, and this change makes it true.

## Impact

- `src/theme.ts` (theme application rewritten through the public `getTheme` / `setTheme` API), `src/thinking.ts` and `src/summaries.ts` (diamond strings and streaming header), `themes/quiet.json` (`thinkingText` → dim), plus their tests.
- Display-only: no tool execution, model-visible results, session data, permissions, or print/RPC behavior change.
- Explicitly out of scope: restyling tools registered by other extensions (subagents, goal, fff search). Their rows keep their own renderers; see `design.md` for why the public extension API cannot reach them. `ask_user_question` was in this list and has since been taken up by `quiet-tui-questionnaire`, which substitutes its row inside the transcript container patch instead of re-registering it.
