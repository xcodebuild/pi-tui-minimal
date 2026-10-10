## Purpose

Defines quiet interactive rendering for pi: no filled color blocks, live truncated streaming, collapse-on-complete, merged inspect-tool summaries, and diffs only for edit and write. The style is on whenever the extension is loaded.

## ADDED Requirements

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

### Requirement: No filled box backgrounds
While the extension is loaded, user messages, tool rows, thinking chrome, and the composer MUST NOT paint filled background bands using pi’s `userMessageBg`, `toolPendingBg`, `toolSuccessBg`, `toolErrorBg`, or `customMessageBg` tokens. Emphasis MUST use foreground color, dim text, and at most a single-character prefix or thin horizontal rule.

#### Scenario: User turn has no color band
- **WHEN** the user submits a prompt
- **THEN** the prompt in the transcript renders without a filled background rectangle

#### Scenario: Tool row has no color band
- **WHEN** a built-in tool call is shown (pending, success, or error)
- **THEN** that row renders without a filled pending/success/error background rectangle

#### Scenario: Composer has no fill
- **WHEN** the input editor is idle or focused
- **THEN** the composer MUST NOT fill its interior with a background color
- **AND** it MAY show a dim prefix (for example `>`) and dim top/bottom rules

### Requirement: Thinking streams inline in the transcript then collapses in place
The system SHALL render assistant thinking inline in the transcript, inside the assistant message and in execution order (not in a widget below the transcript). While thinking is streaming the system SHALL show at most 3 visible lines of the newest thinking text, auto-scrolling to the latest line, and when thinking for that turn ends the system SHALL replace that block in place with a single summary line. The system MUST NOT strip or rewrite thinking content in the session or the model context.

#### Scenario: Thinking is in progress
- **WHEN** the model streams thinking tokens for the current assistant message
- **THEN** the newest 3 thinking lines are visible inside the assistant message
- **AND** new lines replace the oldest visible line (tail scroll)
- **AND** no widget is mounted below the transcript for thinking

#### Scenario: Thinking completes
- **WHEN** thinking for the current assistant turn ends
- **THEN** the thinking block collapses in place to one summary line
- **AND** the summary shows the duration when it is known (for example `Thought for 1.2s`)

#### Scenario: Thinking from a previous session is restored
- **WHEN** a resumed session renders thinking whose duration is unknown
- **THEN** the block collapses to a summary line without a duration (for example `Thought`)
- **AND** the extension MUST NOT rerender the running tail for it

#### Scenario: Thinking is hidden with pi’s control
- **WHEN** pi’s Hide thinking setting is enabled
- **THEN** pi renders the hidden-thinking label instead of the thinking block
- **AND** the extension MUST warn once per session, MUST NOT write the setting, and MUST still keep the label showing the collapsed summary

#### Scenario: User reveals full thinking
- **WHEN** the user uses pi’s existing hide/show thinking control
- **THEN** full thinking text remains available in the stored assistant message
- **AND** the extension MUST NOT delete thinking from the stored assistant message

### Requirement: Non-mutation tools stream then collapse
While a built-in `bash`, `read`, `grep`, `find`, or `ls` call is running or streaming, the system SHALL show a one-line header plus a fixed-height tail viewport of at most 5 output lines. When `bash` finishes, the system SHALL collapse that call to its own single summary line (`Run …`). Inspect tools follow the merge requirement instead of keeping one line per call. Full per-tool output MUST be available when tool output is expanded.

#### Scenario: Bash is running
- **WHEN** the agent `bash` tool is executing and producing output
- **THEN** the row shows a header with a short run title or the command
- **AND** at most 5 newest output lines are visible
- **AND** the row has no filled background box

#### Scenario: Bash completes
- **WHEN** `bash` exits successfully
- **THEN** that call is a single line such as `Run git status`
- **AND** the live output viewport is not shown
- **AND** it MUST NOT be merged onto an inspect-tool summary line

#### Scenario: User expands a collapsed tool
- **WHEN** the user toggles pi’s tool-output expand control
- **THEN** each tool shows its own full captured output
- **AND** toggling again restores the collapsed (and merged, for inspect tools) view

### Requirement: Consecutive inspect tools merge into one summary line
Completed `read`, `ls`, `grep`, and `find` calls that form one burst SHALL render as a single diamond summary line, aggregating counts by kind and joining kinds with commas. A burst is consecutive inspect tools with no intervening assistant text, `bash`, `edit`, or `write`. Same kind MUST be counted together (`Read 46 files`, not 46 separate lines). Failed inspect calls MUST NOT be counted into the success summary; they keep their own error line. `edit` and `write` MUST NOT join a merge line.

#### Scenario: Mixed inspect burst
- **WHEN** a turn completes `read` 46 times, `ls` 3 times, and `grep` 15 times with no bash/edit/write/assistant text between them
- **THEN** the default view is one line equivalent to `Read 46 files, Listed 3 dirs, Searched 15 patterns`
- **AND** no file bodies, listings, or match dumps are shown

#### Scenario: Inspect tools split by bash
- **WHEN** the agent runs `read`, then `bash`, then `ls`
- **THEN** the default view is three rows: a read summary, a `Run …` line, and a listed-dirs summary
- **AND** read and ls MUST NOT share a line across the bash call

#### Scenario: Single inspect tool
- **WHEN** only one `read` completes in a burst
- **THEN** the line is equivalent to `Read 1 file`

#### Scenario: Expand unmerges
- **WHEN** the user expands tool output on a merged inspect burst
- **THEN** each tool in the burst shows its own output
- **AND** collapsing restores the single merged line

### Requirement: Only edit and write show diffs by default
`edit` and `write` SHALL render a unified diff in the default (not expanded-toggle) view. No other built-in tool SHALL show a diff or a full file body in the default view. `write` of a new file SHALL render as an all-additions diff. `write` that overwrites an existing file SHALL render as a diff against the previous file contents.

#### Scenario: Edit shows a diff
- **WHEN** `edit` applies successfully
- **THEN** the row shows the path and a unified diff with added/removed highlighting
- **AND** the row has no filled background box

#### Scenario: Write new file shows an additions diff
- **WHEN** `write` creates a file that did not exist
- **THEN** the default view shows the new path and the written content as added lines

#### Scenario: Write overwrite shows a before/after diff
- **WHEN** `write` replaces an existing file
- **THEN** the default view shows a unified diff of previous contents versus the written contents

#### Scenario: Collapsed edit or write
- **WHEN** the user collapses an `edit` or `write` row with the tool-output expand control
- **THEN** the row becomes a single line with the path and `+N/−M` counts

#### Scenario: Read does not show a diff
- **WHEN** `read` completes
- **THEN** the default view MUST NOT show file contents or a diff

### Requirement: Errors stay one line until expanded
A failed or aborted tool call SHALL collapse to a single error summary line (tool name, primary argument, and exit code or error text). Expanded view SHALL show the captured output or error details. The system MUST NOT keep a tall error dump in the default view.

#### Scenario: Bash non-zero exit
- **WHEN** `bash` exits with a non-zero code
- **THEN** the collapsed row is one line including the command and the exit code
- **AND** stdout/stderr are visible only when expanded

#### Scenario: Edit or write failure
- **WHEN** `edit` or `write` fails
- **THEN** the default view is one error line for that path
- **AND** no partial diff is presented as success

### Requirement: Bash rows stay separate
Each `bash` call SHALL keep its own row while running and after it completes. Completing one bash call MUST NOT merge with another bash call or with inspect summaries.

#### Scenario: Two bash calls
- **WHEN** two `bash` calls run in the same turn
- **THEN** each has its own header and live tail while running
- **AND** each collapses to its own `Run …` line when done

### Requirement: User-typed shell keeps pi’s runner
The extension MUST NOT replace the built-in UI for user-typed `!` / `!!` shell commands. Those commands MAY keep pi’s bordered runner. Agent `bash` tool calls remain under quiet rendering.

#### Scenario: User runs !ls
- **WHEN** the user submits `!ls`
- **THEN** pi’s built-in user-bash component is used
- **AND** the agent `bash` tool later in the same session still uses quiet collapse
