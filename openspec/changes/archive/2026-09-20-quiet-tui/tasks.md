## 1. Package scaffold

- [x] 1.1 Add `package.json` for `pi-quiet-tui` with `pi.extensions` / `pi.themes`, peerDependencies on `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, and `typebox` at `"*"`, and verify `npm install` succeeds
- [x] 1.2 Create `extensions/index.ts` that exports a default factory and registers nothing but a no-op `session_start`, and verify `pi -e ./extensions/index.ts --help` (or a dry load) does not throw
- [x] 1.3 Add `themes/quiet.json` with empty fill tokens (`userMessageBg`, `toolPendingBg`, `toolSuccessBg`, `toolErrorBg`, `customMessageBg`) and verify it validates against pi’s theme schema

## 2. Shared rendering primitives

- [x] 2.1 Implement `src/tail-viewport.ts` (last-N visual lines, no background) and verify a unit test covers 3-line and 5-line tails plus empty input
- [x] 2.2 Implement `src/summaries.ts` for `Run …`, inspect merge phrasing (`Read N files`, `Listed N dirs`, `Searched N patterns`), and edit/write `+N/−M`, and verify tests for singular/plural and comma-joined kinds
- [x] 2.3 Implement `src/burst.ts` to open/close inspect bursts, aggregate counts, pick the last visible row, and omit errors, and verify tests for merge-across-reads, split-by-bash, expand-unmerge, and empty rows for non-last tools

## 3. Chrome: theme and composer

- [x] 3.1 Implement `src/theme.ts` to clone the active theme and clear fill tokens, with fallback to `themes/quiet.json`, and verify a unit test that patched fill slots are empty while accent/text slots stay
- [x] 3.2 Implement `src/composer.ts` as a `CustomEditor` with dim top/bottom rules and a dim `>` prefix, no interior fill, and verify a render snapshot has no background paint and includes the prefix
- [x] 3.3 On `session_start` (interactive only), apply the theme patch and `setEditorComponent`; skip UI calls when `ctx.hasUI` is false, and verify print/RPC load does not call TUI APIs

## 4. Non-mutation tools

- [x] 4.1 Override `bash` with original `execute`, `renderShell: "self"`, 5-line live tail, collapse to its own `Run …` line, never merge with inspect tools, and verify renderer tests for running / done / expanded / non-zero exit / two bash calls staying two lines
- [x] 4.2 Override `read`, `grep`, `find`, and `ls` with live 5-line tails, collapsed merge via `BurstTracker`, empty self-shell for non-last rows (no blank gaps), and verify tests for a mixed burst (`Read 46 files, Listed 3 dirs, Searched 15 patterns`), split-by-bash, and expand unmerge
- [x] 4.3 Confirm overrides copy original `description`, `parameters`, `promptSnippet`, and `promptGuidelines`, and verify a test that execute still delegates to `createXTool`

## 5. Edit and write diffs

- [x] 5.1 Override `edit` with original execute, `renderShell: "self"`, default unified diff, collapsed `path +N/−M`, no fill, and verify tests for success diff, collapse counts, and error one-liner
- [x] 5.2 Wrap `write.execute` to capture previous contents, keep original `content` text, put diff in `details`, render create as all-additions and overwrite as unified diff, and verify tests for create / overwrite / missing previous file / error

## 6. Thinking inline stream and collapse

- [x] 6.1 Register a `registerMarkdownTransformer` for `assistant-thinking` that returns the newest 3 visual lines while `isStreaming` (wrapping only the last logical lines so cost stays flat as thinking grows) and the collapsed `Thought for Xs` one-liner when final, passing other Markdown through untouched, and verify transformer tests for the tail, the duration label, and passthrough
- [x] 6.2 Track thinking per assistant message on `message_update` / `message_end`, key collapsed labels by thinking-run text so each run of a message keeps its own duration, and fall back to `Thought` for restored runs; verify tests for multi-run messages, restored runs, and that `message_end` does not strip thinking
- [x] 6.3 On `session_start` set the hidden-thinking label, warn once when pi’s `hideThinkingBlock` setting is on, and guard all UI calls on `ctx.hasUI`; verify print/RPC paths make no UI calls
- [x] 6.4 Remove the `quiet-thinking` editor widget and verify thinking renders only through the assistant message

## 7. Docs and integration check

- [x] 7.1 Write `README.md` covering install (`pi -e`, `pi install`, `~/.pi/agent/extensions/`), auto-on behavior, thinking rendering inline with **Hide thinking** off (`Ctrl+T`) and the one-line warning when it is on, `Ctrl+O` expand, user `!` bash unchanged, and the built-in override warning, and verify the file names no product-branded commands
- [x] 7.2 Load the extension in interactive pi against a throwaway prompt that exercises thinking, a burst of reads/ls/grep, bash, and edit/write, and verify: merged inspect line, separate `Run …` lines, `Thought for …`, diffs only on edit/write, no fill bands, no extra slash command
