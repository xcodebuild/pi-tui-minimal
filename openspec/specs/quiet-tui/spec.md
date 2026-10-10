# quiet-tui Specification

## Purpose
Defines quiet interactive rendering for pi: no filled color blocks, one-line live rows, collapse-on-complete, merged inspect-tool summaries, and diffs only for edit and write — and there only when expanded. The style is on whenever the extension is loaded.

## Requirements

### Requirement: Extension is presentation-only
The quiet TUI extension SHALL change only interactive rendering and chrome. It MUST NOT change tool execution results sent to the model, permission prompts, session persistence of tool arguments/results, or behavior in print and RPC modes.

#### Scenario: Interactive session loads the extension
- **WHEN** a user starts pi interactive mode with this extension enabled
- **THEN** built-in tools still execute with their original semantics and result content
- **AND** the interactive transcript uses the quiet rendering described in this spec with no extra command

#### Scenario: Print and RPC modes are unchanged
- **WHEN** the extension is loaded in print or RPC mode
- **THEN** those modes MUST NOT depend on TUI components or fail because the extension is present

### Requirement: Style is active on load
Loading the extension SHALL enable quiet rendering for that process. The extension MUST NOT register a command or session toggle to turn the style off. Unloading the extension (not loading it) is how the user returns to pi’s default TUI.

#### Scenario: No extra command
- **WHEN** the extension is loaded
- **THEN** quiet rendering is already on
- **AND** no extension command is required to enable it

#### Scenario: Fullscreen TUI mode
- **WHEN** interactive mode runs with pi's experimental `fullscreen` TUI mode
- **THEN** quiet rendering, the transcript blank-line tightening, and the questionnaire row substitution apply exactly as in `regular` mode
- **AND** click routing still matches the tightened rows

### Requirement: No filled box backgrounds
While the extension is loaded, user messages, tool rows, thinking chrome, and the composer MUST NOT paint filled background bands using pi’s `userMessageBg`, `toolPendingBg`, `toolSuccessBg`, `toolErrorBg`, or `customMessageBg` tokens.

#### Scenario: User turn has no color band
- **WHEN** the user submits a prompt
- **THEN** the prompt in the transcript renders without a filled background rectangle

#### Scenario: Tool row has no color band
- **WHEN** a built-in tool call is shown (pending, success, or error)
- **THEN** that row renders without a filled pending/success/error background rectangle

#### Scenario: Composer has no fill
- **WHEN** the input editor is idle or focused
- **THEN** the composer MUST NOT fill its interior with a background color
- **AND** it MAY use dim top/bottom rules
- **AND** it MUST NOT add a prompt prefix of its own, so the input row starts where pi’s editor starts

#### Scenario: Composer keeps pi’s editor lines intact
- **WHEN** the composer renders input that overflows the visible area, or a working-status indicator is displayed
- **THEN** the top/bottom rules keep pi’s own text (scroll indicators such as `↑ 3 more` / `↓ 2 more`, and the working status)
- **AND** the extension MUST NOT rewrite, pad, or strip any line of the editor’s render output

#### Scenario: Autocomplete list is not prefixed
- **WHEN** pi shows the slash-command or file-suggestion list inside the composer
- **THEN** each suggestion row renders with pi’s own selection marker (`→`) and no additional prefix from the extension

### Requirement: Row emphasis uses accent and weight
The extension SHALL give each one-line row a scannable anchor using foreground color, weight, and one `◆` marker. On a tool row the `◆` marker and the action word SHALL be accented and bold, and the action word SHALL be capitalized the same way on every row (`Run`, `Read`, `Listed`, `Edit`, `Write`, `Thought`); counts and paths SHALL be bold; descriptions, merge nouns, command text and the elapsed-time clocks SHALL stay in the theme’s `dim` slot; and added and removed line counts SHALL be drawn in pi’s `toolDiffAdded` and `toolDiffRemoved` colors so the two never look alike. Thinking labels SHALL be accented the same way. Emphasis MUST NOT add a filled background, a multi-character prefix, or any decoration beyond those colors, weight, and `dim`.

#### Scenario: Run row leads with its action
- **WHEN** a `bash` row is collapsed to its summary line
- **THEN** the `◆` marker and `Run` (or `Ran`, once it has finished) are accented and bold
- **AND** the run title or command text is dim
- **AND** the live or settled ` for 1.2s` clock stays dim, with no weight or accent of its own

#### Scenario: Merged inspect row separates counts from nouns
- **WHEN** a burst merges into `Listed 3 dirs, Searched 15 patterns`
- **THEN** each kind name is accented and bold
- **AND** each count is bold
- **AND** the nouns (`dirs`, `patterns`) and the separator commas are dim

#### Scenario: Merged read row lists paths
- **WHEN** a burst merges reads into `Read src/a.ts, test/b.ts +44`
- **THEN** `Read` is accented and bold
- **AND** the listed paths are bold
- **AND** a trailing `+44` count of the paths the row does not list is dim

#### Scenario: Path and counts are readable on a diff row
- **WHEN** an `edit` or `write` row is shown with its `+N/−M` counts
- **THEN** the path is bold
- **AND** one count per sign is drawn in its diff color (`toolDiffAdded` for `+N`, `toolDiffRemoved` for `−M`)
- **AND** a path containing spaces is bolded whole, not split at the first space

#### Scenario: Thinking labels are accented
- **WHEN** thinking streams or collapses
- **THEN** the `◆` and the word (`Thinking`, `Thought`) are accented and bold
- **AND** the token count is bold and keeps the thinking color rather than the terminal default
- **AND** a known duration stays dim
- **AND** the hidden-thinking label uses the same accented form

#### Scenario: An unrecognised row shape still renders
- **WHEN** a header does not match any known shape
- **THEN** the `◆` and the first word are accented and bold and the remainder is dim
- **AND** no text from the row is dropped or reordered

### Requirement: Thinking streams inline in the transcript then collapses in place
The system SHALL render assistant thinking inline in the transcript, inside the assistant message and in execution order (not in a widget below the transcript). While thinking is streaming the system SHALL show a single live line under the accent header, carrying a live token count and the elapsed time, in that order (for example `◆ Thinking 1,234 tokens for 1.2s`), instead of the thinking text, so the block is exactly one row tall and the content below it never shifts; the count SHALL be an estimate of the accumulated thinking text and SHALL never decrease while a run streams, and the elapsed seconds SHALL be measured from the first thinking token of the run. When thinking for that turn ends the system SHALL replace that line in place with a single summary line carrying the duration and the final count. Pressing pi's tool-output expand control (`Ctrl+O`) SHALL expand the block in place to the full thinking text. The system MUST NOT strip or rewrite thinking content in the session or the model context.

#### Scenario: Thinking is in progress
- **WHEN** the model streams thinking tokens for the current assistant message
- **THEN** one line inside the assistant message shows the header, the token count so far, and the elapsed seconds so far (for example `◆ Thinking 1,234 tokens for 0.8s`)
- **AND** the thinking text itself is not drawn while it streams
- **AND** the line stays exactly one row tall, so the content below it does not shift
- **AND** the count only grows and the clock only advances as the run grows
- **AND** no widget is mounted below the transcript for thinking

#### Scenario: Thinking completes
- **WHEN** thinking for the current assistant turn ends
- **THEN** the live line collapses in place to one summary line
- **AND** the summary shows the final count and, when it is known, the duration after it (for example `Thought 1,234 tokens for 1.2s`)

#### Scenario: Thinking from a previous session is restored
- **WHEN** a resumed session renders thinking whose duration is unknown
- **THEN** the block collapses to a summary line without a duration, but with the count of the run's text (for example `Thought 1,234 tokens`)
- **AND** the extension MUST NOT render a live counter for it

#### Scenario: Thinking is hidden with pi’s control
- **WHEN** pi’s Hide thinking setting is enabled
- **THEN** pi renders the hidden-thinking label instead of the thinking block
- **AND** the extension MUST warn once per session, MUST NOT write the setting, and MUST still keep the label showing the collapsed summary

#### Scenario: User reveals full thinking
- **WHEN** the user presses pi’s tool-output expand control (`Ctrl+O`)
- **THEN** the thinking block expands in place to the full thinking text
- **AND** collapsing restores the one-line label
- **AND** full thinking text remains available in the stored assistant message, and the extension MUST NOT delete thinking from it

### Requirement: Non-mutation tools stream then collapse
While a built-in `bash`, `read`, `grep`, `find`, or `ls` call is running or streaming, the system SHALL show a one-line header and MUST NOT draw the call's output there, so the row's height is the same running and settled and the transcript below it does not move. While a `bash` command runs, its header SHALL carry a live ` for 1.2s` clock that advances at least once a second. When `bash` finishes, the system SHALL collapse that call to its own single summary line whose verb turns past tense and whose clock settles (`Ran … for 1.2s`). Inspect tools follow the merge requirement instead of keeping one line per call. Full per-tool output MUST be available when tool output is expanded — for a still-running `bash` call that means every line printed so far.

#### Scenario: Bash is running
- **WHEN** the agent `bash` tool is executing and producing output
- **THEN** the row shows a header with a short run title or the command and the elapsed seconds so far (for example `◆ Run 检查依赖 for 2.1s`)
- **AND** no output line is drawn under it
- **AND** the clock keeps ticking while output is paused
- **AND** the row has no filled background box

#### Scenario: Running row keeps its height
- **WHEN** a `bash` or inspect call goes from running to settled
- **THEN** the row draws the same number of lines before and after (the header alone, or the header plus the diff for an expanded `edit`/`write`)
- **AND** output that has printed so far is drawn only when the row is expanded

#### Scenario: Bash completes
- **WHEN** `bash` exits successfully
- **THEN** that call is a single line whose verb is past tense and which carries the settled duration (for example `Ran git status for 1.2s`)
- **AND** the live output viewport is not shown
- **AND** it MUST NOT be merged onto an inspect-tool summary line

#### Scenario: User expands a collapsed tool
- **WHEN** the user toggles pi’s tool-output expand control
- **THEN** each tool shows its own full captured output
- **AND** a `bash` call that is still running shows all of its output
- **AND** toggling again restores the collapsed (and merged, for inspect tools) view

### Requirement: Consecutive inspect tools merge into one summary line
Completed `read`, `ls`, `grep`, and `find` calls that form one burst SHALL render as a single diamond summary line, joining kinds with commas. A burst is consecutive inspect tools with no intervening assistant text, `bash`, `edit`, or `write`. Same kind MUST be counted together. `read` SHALL list the paths it read — relative to the session, at most two of them, then a `+N` count for the rest — instead of a file count; the other kinds count by kind. Failed inspect calls MUST NOT be counted into the success summary; they keep their own error line. `edit` and `write` MUST NOT join a merge line.

#### Scenario: Mixed inspect burst
- **WHEN** a turn completes `read` 4 times, `ls` 3 times, and `grep` 15 times with no bash/edit/write/assistant text between them
- **THEN** the default view is one line equivalent to `Read src/a.ts, test/b.test.ts +2, Listed 3 dirs, Searched 15 patterns`
- **AND** no file bodies, listings, or match dumps are shown
- **AND** a `read` whose path is unknown falls back to its file count (`Read 46 files`)

#### Scenario: Inspect tools split by bash
- **WHEN** the agent runs `read`, then `bash`, then `ls`
- **THEN** the default view is three rows: a read summary, a `Run …` line, and a listed-dirs summary
- **AND** read and ls MUST NOT share a line across the bash call

#### Scenario: Single inspect tool
- **WHEN** only one `read` completes in a burst
- **THEN** the line is equivalent to `Read src/a.ts`

#### Scenario: Expand unmerges
- **WHEN** the user expands tool output on a merged inspect burst
- **THEN** each tool in the burst shows its own output
- **AND** collapsing restores the single merged line

### Requirement: Only edit and write carry a diff, and only when expanded
`edit` and `write` SHALL render a one-line header with the size of the change in the default (not expanded) view, and MUST NOT render the unified diff there. No other built-in tool SHALL show a diff or a full file body in the default view. Pressing pi’s tool-output expand control SHALL expand an `edit` or `write` row to its unified diff, with the same header above it. `write` of a new file SHALL render as an all-additions diff. `write` that overwrites an existing file SHALL render as a diff against the previous file contents.

#### Scenario: Edit shows its counts by default
- **WHEN** `edit` applies successfully
- **THEN** the default row is one line with the path and the `−old +new` counts
- **AND** the row has no filled background box
- **AND** the unified diff is NOT drawn

#### Scenario: Write new file
- **WHEN** `write` creates a file that did not exist
- **THEN** the default view shows the new path and its line count
- **AND** the all-additions diff is shown only when expanded

#### Scenario: Write overwrite
- **WHEN** `write` replaces an existing file
- **THEN** the expanded view shows a unified diff of previous contents versus the written contents

#### Scenario: Expanded edit or write
- **WHEN** the user expands an `edit` or `write` row with the tool-output expand control
- **THEN** the row shows the same path-and-counts header followed by the unified diff with added/removed highlighting

#### Scenario: Collapsed edit or write
- **WHEN** the user collapses an expanded `edit` or `write` row again
- **THEN** the diff disappears and the row is the single path-and-counts header

#### Scenario: Read does not show a diff
- **WHEN** `read` completes
- **THEN** the default view MUST NOT show file contents or a diff

### Requirement: Write and edit report the size of the change while streaming
While a `write` or `edit` call's arguments are still streaming, the row SHALL show a one-line header carrying the size of the change, updated as the arguments arrive: `write` counts the lines of the content received so far, and `edit` totals the old and new lines of every replacement in the call. The counts stay on the header once the call settles, above the diff when the row is expanded. The counts MUST NOT be a second row, MUST NOT add a filled background, and MUST NOT change what the model or the session stores.

#### Scenario: Write streams its line count
- **WHEN** the model streams a `write` whose content has reached 128 lines
- **THEN** the header is equivalent to `◆ Write src/a.ts  128 lines`
- **AND** the count grows as more content arrives and closes on the final line total

#### Scenario: Edit streams its old/new line counts
- **WHEN** the model streams an `edit` whose replacements total 3 old lines and 12 new lines
- **THEN** the header is equivalent to `◆ Edit src/a.ts  −3 +12`
- **AND** the `−3` and the `+12` are drawn in the removed and added diff colors respectively

#### Scenario: Settled row keeps one header
- **WHEN** an `edit` or `write` call finishes
- **THEN** the row shows the path with its counts exactly once, above the diff when expanded
- **AND** the header MUST NOT be repeated by the call and result renderers

#### Scenario: Expanded mutation row
- **WHEN** the user expands an `edit` or `write` row with the tool-output expand control
- **THEN** the header keeps the same path and counts, and the unified diff is drawn below it
- **AND** the streamed line counts are not shown a second time

### Requirement: Errors stay one line until expanded
A failed or aborted tool call SHALL collapse to a single error summary line (tool name, primary argument, and exit code or error text). Expanded view SHALL show the captured output or error details. The system MUST NOT keep a tall error dump in the default view. The collapsed line SHALL keep the theme’s `error` color and SHALL bold its `◆` marker, the tool or action name, and the trailing exit-code or error status, without adding a second hue.

#### Scenario: Bash non-zero exit
- **WHEN** `bash` exits with a non-zero code
- **THEN** the collapsed row is one line including the command and the exit code
- **AND** stdout/stderr are visible only when expanded

#### Scenario: Edit or write failure
- **WHEN** `edit` or `write` fails
- **THEN** the default view is one error line for that path
- **AND** no partial diff is presented as success

#### Scenario: Failed row reads as a failure
- **WHEN** a tool call fails or a run exits non-zero
- **THEN** the row keeps the theme’s `error` color
- **AND** the `◆` marker, the tool or action name, and the exit-code or error status are bold
- **AND** the rest of the row stays in the error color, with no second hue

### Requirement: Bash rows stay separate
Each `bash` call SHALL keep its own row while running and after it completes. Completing one bash call MUST NOT merge with another bash call or with inspect summaries.

#### Scenario: Two bash calls
- **WHEN** two `bash` calls run in the same turn
- **THEN** each has its own header with its own live clock while running
- **AND** each collapses to its own `Ran … for 1.2s` line when done

### Requirement: User-typed shell keeps pi’s runner
The extension MUST NOT replace the built-in UI for user-typed `!` / `!!` shell commands. Those commands MAY keep pi’s bordered runner. Agent `bash` tool calls remain under quiet rendering.

#### Scenario: User runs !ls
- **WHEN** the user submits `!ls`
- **THEN** pi’s built-in user-bash component is used
- **AND** the agent `bash` tool later in the same session still uses quiet collapse
