## Context

See `proposal.md` for motivation. This is a pi coding-agent extension in an empty repo, not a fork of pi.

Pi interactive mode today:

- User messages sit in a `Box` filled with `userMessageBg`.
- Tool rows sit in a `Box` filled with `toolPendingBg` / `toolSuccessBg` / `toolErrorBg` unless the tool sets `renderShell: "self"`.
- The composer is a pair of full-width horizontal rules (no interior fill).
- Thinking renders as italic markdown inside the assistant message, streaming in the transcript. `registerMarkdownTransformer` receives `("assistant-thinking", isStreaming)` and can rewrite that markdown at render time (display-only; the session and model context keep the original), and `setHiddenThinkingLabel` covers pi’s Hide thinking mode. There is no hook that puts an independent foldable block *into* the transcript.
- Built-in `bash` already streams a 5-line tail, but it stays 5 lines after the command finishes. `write` dumps highlighted file body. `edit` already shows a diff with `renderShell: "self"`.
- Extensions can override built-in tools by `registerTool` with the same name, supplying `renderCall` / `renderResult` while delegating `execute`.
- `ctx.ui.setWidget` can place a live component above the composer. `ctx.ui.setEditorComponent` can restyle the composer. `ctx.ui.setTheme` can change colors. There is no hook to replace `UserMessageComponent` or `BashExecutionComponent` (user `!` bash).

Reference interaction (quiet coding TUI, not a product name in this repo): live work in a short truncated viewport; done inspect tools merge onto one count line (`Read 46 files, Listed 3 dirs, Searched 15 patterns`); each shell call stays `Run …`; thinking becomes `Thought for 0.4s`; only file mutations keep a diff; chrome is a dim diamond prefix, not filled bands.

## Goals / Non-Goals

**Goals:**

- Implement the `quiet-tui` spec entirely through pi’s public extension and theme APIs.
- Share one tail-viewport renderer, one-line summaries, and an inspect-tool burst aggregator.
- Keep `edit`/`write` diffs stable (reuse pi’s `renderDiff` / edit preview path where possible).
- Turn the style on in `session_start` with no command and no in-session toggle.

**Non-Goals:**

- Changing pi core, adding extension APIs, or patching `AssistantMessageComponent` / `UserMessageComponent` / `BashExecutionComponent`.
- Replacing pi’s scrollback selection, vim mode, permission dialogs, or footer.
- Restyling user-typed `!` / `!!` bash.
- Changing LLM-visible tool results or thinking content stored in the session.

## Decisions

### 1. Ship a pi package, not a single anonymous file

Layout:

```
package.json          # name: pi-quiet-tui; pi.extensions + pi.themes
README.md
extensions/index.ts   # factory: register tools, session_start chrome
src/tail-viewport.ts  # shared fixed-height tail component (thinking tail + tool tails)
src/summaries.ts      # one-line headers/summaries and merge phrasing
src/burst.ts          # inspect-tool burst aggregator
src/theme.ts          # strip fill tokens from the active theme
src/composer.ts       # CustomEditor: dim rules, optional `>` prefix
themes/quiet.json     # fallback no-fill dark theme
```

Peer deps: `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, `typebox` at `"*"`. Users install via `pi install ./` / `pi -e ./extensions/index.ts` / copy into `~/.pi/agent/extensions/`.

Alternative: one giant `index.ts`. Rejected — the viewport, write-diff wrapper, and theme patch are easier to test as modules.

### 2. Override built-in tools; do not wrap the agent loop

For `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`: `createXTool(cwd)` for execute/schema, then `pi.registerTool({ ...original, renderShell: "self", renderCall, renderResult })`. Inherit `promptSnippet` / `promptGuidelines` from the original definition so the model instructions stay identical.

`renderShell: "self"` is required so `ToolExecutionComponent` does not wrap output in the filled `Box`.

Alternative: a no-fill theme only. Rejected — theme can remove user-message fill, but bash would still keep a 5-line dump after completion, and write would still dump the file body.

### 3. Shared tail viewport, then one-line summary

One `TailViewport` component (max N visual lines, last-N, no background):

| Surface | N while running | After success | After error |
| --- | --- | --- | --- |
| Thinking | 3 | `Thought for Xs` | n/a |
| Inspect (`read` / `ls` / `grep` / `find`) | 5 | merged burst line | own error line |
| `bash` | 5 | own `Run …` line | own error line |
| `edit` / `write` | diff (not a tail) | keep diff | one-line error |

Collapsed examples:

- `◆ Read 46 files, Listed 3 dirs, Searched 15 patterns`
- `◆ Run git status`
- `Thought for 0.4s` (inline, where the thinking streamed)
- `◆ edit  src/a.ts  +12 −3` (only when the user collapses with `Ctrl+O`)

Default for edit/write is the diff, not the one-liner. `Ctrl+O` is pi’s existing `app.tools.expand`; do not add a new shortcut.

Header chrome: a dim diamond (or `·` on limited terminals). No left accent-bar animation.

### 3b. Inspect burst merge

Pi still mounts one `ToolExecutionComponent` per call. Merge is a render-time illusion:

1. `BurstTracker` in the extension records inspect tool ids, kinds, and counts (`read`→files, `ls`→dirs, `grep`/`find`→patterns/files as “Searched” / “Found”).
2. A burst is consecutive inspect tools. `bash`, `edit`, `write`, assistant text, or a user prompt closes it.
3. Collapsed: every inspect row in the burst except the last returns an empty `Container`. The last row paints the merged line. Completing a new inspect tool invalidates the previous last row so it goes blank.
4. Expanded (`Ctrl+O`): every row renders its own output; no merge.
5. Errors stay on their own row and are omitted from the success counts.
6. Parallel inspect tools in the same burst still merge when they complete; parallel `bash` never merges.

Phrasing (singular/plural): `Read 1 file` / `Read 46 files`, `Listed 1 dir` / `Listed 3 dirs`, `Searched 15 patterns`. Join kinds with `, `.

Skill-load lines (`Read 1 skill`) are pi’s skill-invocation component, not the `read` tool. Restyle only if a public hook exists; otherwise leave them. File `read` still merges.

Alternative: inject a custom transcript message for the merge line. Rejected — pollutes the session.

### 4. Thinking streams and collapses inside the assistant message

`registerMarkdownTransformer` runs on the exact Markdown pi hands to the thinking block, with `messageType === "assistant-thinking"` and `isStreaming` per component, so one transformer owns both phases:

1. On `session_start`, `setHiddenThinkingLabel("Thinking")`, and warn once if pi’s `hideThinkingBlock` setting is on.
2. `message_update` only records when the current assistant message started producing thinking (for the duration).
3. `message_end` maps each thinking run of that message to `Thought for Xs` (runs are adjacent thinking blocks joined by a blank line, exactly as pi batches them) and keeps the hidden label in sync.
4. The transformer returns the newest 3 visual lines while `isStreaming`, the remembered duration label for a finalized run, and `Thought` for runs it has never seen (restored sessions). It returns other Markdown untouched.

Only the last logical lines are wrapped to the available width, so the cost per streaming token stays flat as thinking grows; the remembered run texts are FIFO-capped.

Requires pi’s Hide thinking (`Ctrl+T`) to be off. With it on, pi renders `setHiddenThinkingLabel` instead of the block and no extension API can flip that setting, so the extension warns once per session instead of writing `hideThinkingBlock` into settings.

Alternative: keep the live 3-line tail in a `setWidget` component above the editor. Rejected — it renders under the transcript (below the running turn) instead of in the execution flow, and it duplicates the collapse pi already supports for visible thinking.

Alternative: inject custom messages for thinking. Rejected — pollutes the session and duplicates content.

### 5. Strip fill tokens from the current theme instead of forcing a named theme

On `session_start`, clone the active theme, set `userMessageBg`, `toolPendingBg`, `toolSuccessBg`, `toolErrorBg`, `customMessageBg` to empty (terminal default), `setTheme(patched)`. User’s accent/syntax stay. Fallback: load `themes/quiet.json` if cloning is not possible through the Theme API.

Composer: `setEditorComponent` to a `CustomEditor` subclass that uses `theme.fg("dim")` for the top/bottom rules and a dim `>` prefix. No interior fill (the stock editor already has none).

### 6. Write diffs by wrapping execute, not by changing the LLM result text

`write` details are unused. Wrapper:

1. Resolve path; if the file exists, read previous contents (best-effort; missing file → create).
2. Call original `write.execute`.
3. Put `{ previous, written, diff }` in `details` for the renderer only. `content` stays the original success/error text.

Create → all-additions diff. Overwrite → unified diff via the same `renderDiff` helper edit uses. Renderer default-shows the diff; collapsed shows `+N/−M`.

`edit` keeps original execute and details; only restyle the call/result (no fill, same diff, collapsed one-liner with counts).

### 7. No command, no toggle

`session_start` applies theme patch, composer, hidden-thinking label, and tool overrides (registered at factory time). No `/quiet-ui`, no flags. Disable by not loading the extension.

### 8. User `!` bash stays stock

`user_bash` always constructs pi’s bordered `BashExecutionComponent`, even if an extension returns a result. Do not intercept. Agent `bash` is the restyled path.

## Interaction map

| User-visible event | Running | Done (default) | Expanded (`Ctrl+O` or Hide thinking off) |
| --- | --- | --- | --- |
| User prompt | composer: dim `>` + rules | transcript: markdown, no band | n/a |
| Thinking | 3-line tail inside the assistant message | `Thought for Xs` in place (`Thought` when restored) | `Ctrl+T` hides thinking, leaving the label |
| Assistant text | streams as markdown, no box | same | n/a |
| Inspect `read` / `ls` / `grep` / `find` | header + 5-line tail on the live call | one merged count line for the burst | each tool’s full output |
| `bash` | header + 5-line tail | own `Run …` line | full output |
| `edit` / `write` | path header; diff when args/result ready | keep diff | collapse to `path +N/−M` |
| Tool error | header + tail or spinner | own error line (not in merge counts) | details / stderr |
| Parallel inspect | live tails on running calls | merge into one line as they complete | unmerged full output |
| Parallel bash | independent rows | each `Run …` | each full output |
| User `!` bash | pi bordered runner | pi runner | pi runner |
| Permission / dialogs | unchanged | unchanged | unchanged |

Pi’s global tool-expand (`Ctrl+O`) is all-tools, not per-row. Expand unmerges every inspect row; collapse rebuilds the burst line. Document that.

## Risks / Trade-offs

- [The inline tail needs Hide thinking off] → The transformer only runs for visible thinking; with thinking hidden pi renders `setHiddenThinkingLabel` and no extension API flips `hideThinkingBlock`. Warn once per session instead of writing the setting.
- [Collapsed labels are matched by thinking-run text] → A restored run with byte-identical text would reuse a remembered duration. Harmless, and the FIFO cap keeps memory bounded.
- [User message `Box` still has 1-cell padding even with empty bg] → Accept; empty bg removes the color band, which is the complaint.
- [Overriding built-ins prints pi’s override warning] → Expected; README mentions it.
- [Theme patch overrides user fill tokens] → Intentional. Other theme slots stay. Unload extension / restart without it to restore.
- [Write previous-content read can race with other writers] → Best-effort; on read failure, render as create/additions rather than a fake diff.
- [Global `Ctrl+O` expands every tool] → Live with pi’s model; expand also unmerges inspect bursts.
- [Empty inspect rows still occupy a ToolExecutionComponent (spacers)] → Return a truly empty `Container` and avoid extra `Spacer` in self-shell mode so merged tools do not leave blank gaps.
- [Other extension tools keep the default filled shell] → Out of scope; only the seven built-ins are overridden.

## Migration Plan

- New package; no existing users.
- Enable: `pi -e ./extensions/index.ts` or `pi install` this directory, then start pi. Style is on immediately.
- Disable: remove the package / stop passing `-e`. No settings migration.
- Rollback: git revert / uninstall. No session format changes (extra `write` details are ignored by stock pi).
