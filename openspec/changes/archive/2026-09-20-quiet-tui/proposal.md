## Why

Pi’s interactive TUI paints user turns, tool rows, and the composer as filled boxes, and it leaves thinking plus bash/read output as growing dumps. That is noisy: live work should stay in a short scrolling viewport, finished work should collapse to one line, and only file mutations should keep a diff. This change ships a pi extension (plus a no-fill theme) that applies that quiet transcript as soon as it is loaded.

## What Changes

- Add a pi coding-agent extension that restyles the interactive transcript to a quiet live-then-collapse pattern. Loading the extension turns the style on; there is no extra command or session toggle.
- While a tool is running, stream output in a fixed-height tail viewport; when it finishes, collapse. Assistant thinking streams inline in the transcript as a 3-line tail and collapses in place to `Thought for Xs`. Consecutive inspect tools (`read`, `ls`, `grep`, `find`) in the same burst merge into one comma-separated summary line (for example `Read 46 files, Listed 3 dirs, Searched 15 patterns`). Each `bash` stays its own `Run …` line. Expand with the existing tool-expand key.
- Keep `edit` and `write` as the only tools that show a diff by default (`write` as a create/overwrite diff, not a full-file syntax dump). They never join an inspect merge line.
- Remove filled pi box backgrounds from tool rows, user messages, and the composer. Use dim foreground chrome (accent/prefix/summary) instead of `userMessageBg` / `toolPendingBg` / `toolSuccessBg` / `toolErrorBg` bands.
- Ship a companion no-fill theme applied when the extension loads.
- Document the full interaction (running vs done vs expanded, errors, parallel tools) and the pi API limits (thinking streams inline through the Markdown transformer and requires Hide thinking to be off; user `!` bash keeps pi’s bordered runner).

## Capabilities

### New Capabilities

- `quiet-tui`: Quiet interactive rendering for thinking, tools, user/assistant turns, and the composer: live truncated streaming, collapse-on-complete, merged inspect-tool summaries, diffs only for edit/write, and no filled box backgrounds. Active whenever the extension is loaded.

### Modified Capabilities

- (none — this repo has no existing specs)

## Impact

- New pi package in this repo: TypeScript extension, optional theme JSON, README, and package manifest (`pi.extensions` / `pi.themes`).
- Runtime: `@earendil-works/pi-coding-agent` extension APIs (`registerTool` overrides, `renderShell: "self"`, `message_update`, `registerMarkdownTransformer`, `setHiddenThinkingLabel`, `setEditorComponent`, theme tokens). No changes to the pi monorepo.
- Users load it with `pi -e`, `pi install`, or a copy under `~/.pi/agent/extensions/`. Overriding built-in tools will trigger pi’s existing override warning. Unloading the extension restores pi’s default TUI.
- Does not change tool execution semantics, permissions, LLM context, print/RPC modes, or dialogs/selectors.
