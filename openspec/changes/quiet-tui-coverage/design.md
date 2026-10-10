## Context

See `proposal.md` for motivation and `specs/quiet-tui/spec.md` for the contract. Everything below was verified against `@earendil-works/pi-coding-agent` 0.85.1 (the running CLI is `dist/bundle/cli.js`; the same code is also present unbundled under `dist/`).

**The theme patch never applied.** `dist/modes/interactive/theme/theme.js:540` (and the same code in `dist/bundle/chunks/chunk-JVUZSMYM.js`):

```js
export const theme = new Proxy({}, {
    get(_target, prop) {
        const t = globalThis[THEME_KEY];
        if (!t) throw new Error("Theme not initialized. Call initTheme() first.");
        return t[prop];
    },
});
```

Only a `get` trap. `src/theme.ts` does `theme.bg = patched`, which writes an own property to the proxy's empty `{}` target; every read still forwards to `globalThis[THEME_KEY]`. A node probe against the real module confirmed all of it:

```
theme.name via proxy: dark
assigning theme.bg = marker  →  theme.bg === marker ? false      (write is lost)
mutating the live instance   →  visible through the proxy        (the instance is what matters)
thinkingText = \e[38;2;128;128;128   dim = \e[38;2;102;102;102
```

So today's transcript still paints the fill bands, and a naive `thinkingText → dim` remap would have been lost the same way. `ctx.ui.theme` is that proxy (`interactive-mode.js:1929`), while `ctx.ui.getTheme(name)` returns a real `Theme` instance and `ctx.ui.setTheme(instance)` installs one (`interactive-mode.js:1934-1945`, gated on `instanceof Theme`).

**Thinking is styled by pi, not by the extension.** `assistant-message.js:114-119` builds the thinking block as `new Markdown(..., { color: (t) => theme.fg("thinkingText", t), italic: true }, ...)`, and the hidden-thinking label at line 113 as `new Text(theme.italic(theme.fg("thinkingText", label)))`. A markdown transformer can rewrite the thinking text and nothing else — which is enough for the diamond header and summary, and the theme `fg` remap is enough for the dim color, but not for removing pi's italic (out of scope by decision, not by limitation).

**Other extensions' tool rows are out of reach through the public API.** A row is composed from that tool's own definition (`tool-execution.js` `getCallRenderer` / `getResultRenderer` / `getRenderShell`), the only override mechanism is `registerTool` with the same name, and `ExtensionRunner.getAllRegisteredTools()` (`runner.js:324-335`) is first-registration-per-name-wins while `pi.getAllTools()` hands out copies with no `execute` and no renderers (`agent-session.js:644-648`). The tool table backs both rendering and execution (`agent-session.js:2759`), so the two cannot be split. The installed packages all register their tools inline inside their own factory (fff `src/index.ts:649`, pi-goal `.pi/extensions/pi-goal/index.ts:202/220/269`, pi-subagents `src/index.ts:2302/2582`), and there is no renderer-decorator hook in `ExtensionAPI`.

## Goals / Non-Goals

**Goals:**

- Make the fill-slot stripping real: the active theme in the running process has no fill colors, with the user's other colors untouched.
- Make the `thinkingText → dim` remap real, on the same code path.
- Give thinking a diamond header and a diamond summary line through the existing transformer, keeping the 3-line tail, the duration map, and pi's italic.
- Keep the built-in tool overrides, burst merging, and diff rendering untouched.

**Non-Goals:**

- Restyling, collapsing, or hiding any tool registered by another extension; no compatibility promises for them in the README.
- Rewriting or replacing pi's own theme loader, `AssistantMessageComponent`, `ToolExecutionComponent`, or `Markdown`; no prototype patching.
- Changing pi's italic handling for markdown (`*emphasis*`) or for thinking.
- Adding commands, flags, or a settings surface.

## Decisions

### 1. Install a cloned `Theme` instance instead of writing through the proxy

`applyThemePatch(ui)` becomes:

1. Read the active theme name from the proxy (`ui.theme.name`).
2. Resolve a real instance: `ui.getTheme(name)` (`getThemeByName` → `loadTheme`). If `name` is missing or the lookup fails, fall back to the shipped `quiet` theme via `ui.setTheme("quiet")`, which is the path the code intended all along.
3. Clone it: `const clone = Object.create(Object.getPrototypeOf(live)); Object.assign(clone, live);` — prototype-preserving, so the clone passes pi's `instanceof Theme` check. `Theme` keeps all state in plain own fields (`name`, `sourcePath`, `sourceInfo`, `fgColors`, `bgColors`, `mode`, `theme.js:168-195`), so a shallow copy is a faithful clone.
4. Override two methods **on the clone** with closures that delegate to the original instance:
   - `bg(slot, text)` → returns `text` for the five fill slots, otherwise `live.bg(slot, text)`;
   - `fg(slot, text)` → `live.fg("dim", text)` for `thinkingText`, otherwise `live.fg(slot, text)`.
5. `ui.setTheme(clone)` → `setThemeInstance` → `globalThis[THEME_KEY] = clone`, which is what the proxy and every component read.

Alternatives considered and rejected:

- **Keeping the proxy write** (today's code): silently does nothing.
- **Mutating the live instance through `globalThis[Symbol.for("@earendil-works/pi-coding-agent:theme")]`**: works (probed), but relies on an internal global key — the private-API route this change exists to avoid.
- **Always `ui.setTheme("quiet")`**: supported and simple, but throws away the user's active palette; `themes/quiet.json` is also a hand-maintained copy of pi's `dark.json` that already drifts (missing `scrollbar*`, `searchMatch*`, `thinkingMax`). Kept only as the fallback.
- **Fixing `themes/quiet.json` and shipping no runtime patch**: accepted for the fallback path (`thinkingText` → dim), not as the primary mechanism, because it cannot preserve a custom theme.

Known limit: if the user switches themes after load, pi installs the new theme instance and the patches are gone until the extension reloads. Documented in the README; the previous implementation had the same gap (plus a no-op).

### 2. Thinking gets the diamond from the transformer, the dim color from the theme

`src/summaries.ts` gains the diamond strings and `src/thinking.ts` uses them:

| Phase | Transformer output |
| --- | --- |
| streaming | `◆ Thinking`, then the newest 3 tail lines, each indented by 2 spaces |
| final | `◆ Thought for 1.2s` |
| restored run | `◆ Thought` |

Two leading spaces stay below Markdown's 4-space code-block threshold. The tail cap (`THINKING_TAIL_LINES = 3`), the width-aware `thinkingTail`, the FIFO duration map, and the `isHidden` warning are unchanged. The hidden label is set to the same strings (`◆ Thinking` at session start, the measured summary at `message_end`).

The dim foreground comes from decision 1's `fg` remap, so it applies to the thinking block, to the hidden label, and to anything else that reads `thinkingText` — and to nothing else. `themes/quiet.json` gets `"thinkingText": "dimGray"` so the fallback path matches.

Alternative considered: cancelling pi's italic by injecting `\x1b[23m` into the transformer output. It is public (pi-tui's markdown is `wrapTextWithAnsi` / `visibleWidth` aware) but it fights the renderer for style control and needs to survive line wrapping; the chosen scope keeps pi's italic, so it is unnecessary.

### 3. Other extensions' tool rows are left alone

No code, no allow-list, no README promises for tools this extension does not register. The public API cannot replace their renderers (see Context), and the two reachable alternatives were rejected:

- **Prototype-patching the exported `ToolExecutionComponent`** — technically works, but depends on private method shapes and was explicitly rejected by the user.
- **Calling another package's factory from this extension to re-register its tools with quiet renderers** — double-initializes that package's state (its own manager, DB, event handlers) and still loses the name race.

The consequence is recorded here so a later reader does not mistake it for an oversight: those rows keep their own layout (fff, for example, keeps up to 15 result lines), and only their fill bands are removed, by decision 1. `quiet-tui-questionnaire` later took up `ask_user_question` through a third route this change did not consider — substituting the row's lines inside the container patch that decision 4's tests pin — without re-registering anything.

### 4. Tests pin the two behaviours that were silently broken

- `test/theme.test.ts` gains a fake whose `theme` is a **write-losing proxy** (get-only, like pi's) plus a `getTheme` returning a prototype-based fake `Theme`: assert `setTheme` was called with an object that passes `instanceof FakeTheme`, that `bg("toolSuccessBg", …)` returns unstyled text while `bg("selectedBg", …)` still paints, that `fg("thinkingText", …)` equals the fake's `dim`, and that `fg("error", …)` is unchanged. Also assert the fallback fires when the name lookup fails.
- `test/thinking.test.ts` covers the `◆ Thinking` header, the 2-space indent, `◆ Thought for Xs` / `◆ Thought`, and the hidden-label strings.
- `test/theme-json.test.ts` keeps validating the shipped theme JSON.

## Risks / Trade-offs

- [A theme switch after load drops the patches] → documented; matches the previous behaviour, which additionally never applied at all.
- [Cloning relies on `Theme` keeping state in plain fields] → the fields are read directly in `theme.js:168-195`; the fake-instance test pins the clone contract, and an unexpected shape falls back to `setTheme("quiet")` instead of throwing.
- [`getTheme(name)` may not resolve an exotic theme (in-memory or path-loaded)] → the fallback path is taken; the extension still loads.
- [Thinking dim (#666666) is only slightly darker than pi's thinking gray (#808080)] → the diamond prefix and the summary wording carry most of the visual change; the color is an alignment, not a redesign.
- [Third-party rows stay taller than built-in rows] → accepted and documented as out of scope.

## Migration Plan

- Display-only; no session, settings, or data migration.
- Rollout: unchanged (`pi -e`, `pi install`, or the copy under `~/.pi/agent/extensions/`).
- Rollback: unload the extension; pi's default theme and thinking rendering return on the next start. No residual state is written anywhere.
