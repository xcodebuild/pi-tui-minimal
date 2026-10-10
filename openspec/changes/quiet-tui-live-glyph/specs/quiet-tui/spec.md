## MODIFIED Requirements

### Requirement: Row emphasis uses accent and weight
The extension SHALL give each one-line row a scannable anchor using foreground color, weight, and one single-column marker. On a settled row that marker SHALL be `◆`, accented and bold. On a row that is still running it SHALL be the animated live glyph (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`), bold in the theme’s `warning` slot instead of the accent slot, so a running row and a settled row differ by colour as well as by shape; it SHALL replace `◆` rather than sit beside it, and SHALL be one column wide so the marker cannot change the row’s width. The action word SHALL be capitalized the same way on every row (`Run`, `Read`, `Listed`, `Edit`, `Write`, `Thought`); counts and paths SHALL be bold; descriptions, merge nouns, command text and the elapsed-time clocks SHALL stay in the theme’s `dim` slot; and added and removed line counts SHALL be drawn in pi’s `toolDiffAdded` and `toolDiffRemoved` colors so the two never look alike. Thinking labels SHALL be accented the same way. A failed row SHALL always wear `◆`, whatever it was handed, because it has settled. Emphasis MUST NOT add a filled background, a multi-character prefix, or any decoration beyond those colors, weight, and `dim`.

#### Scenario: Run row leads with its action
- **WHEN** a `bash` row is collapsed to its summary line
- **THEN** the marker and `Run` (or `Ran`, once it has finished) are bold
- **AND** the marker is the accented `◆` on the settled line (`Ran`) and the warning-coloured live glyph on the running one (`Run`)
- **AND** the run title or command text is dim
- **AND** the live or settled ` for 1.2s` clock stays dim, with no weight or accent of its own

#### Scenario: Running row is marked as running
- **WHEN** any row is still running (a `bash` run, an inspect call, a streaming `write`/`edit`, streaming thinking, a pending questionnaire, a running FFF search)
- **THEN** its marker is the live glyph for the current frame, bold in the theme’s `warning` slot
- **AND** the row shows exactly one marker, with no `◆` next to it
- **AND** the row is no wider and no taller than the same row once it settles

#### Scenario: Settled row returns to `◆`
- **WHEN** a running row finishes
- **THEN** its marker is `◆`, accented and bold
- **AND** no live glyph remains on the row

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
- **THEN** the word (`Thinking`, `Thought`) is accented and bold
- **AND** the streaming label leads with the warning-coloured live glyph and the collapsed label with the accented `◆`
- **AND** the token count is bold and keeps the thinking color rather than the terminal default
- **AND** a known duration stays dim
- **AND** the hidden-thinking label uses the same accented `◆` form

#### Scenario: An unrecognised row shape still renders
- **WHEN** a header does not match any known shape
- **THEN** the `◆` and the first word are accented and bold and the remainder is dim
- **AND** no text from the row is dropped or reordered

#### Scenario: A failed row is never marked live
- **WHEN** a tool call fails or a run exits non-zero
- **THEN** the row’s marker is the accented, bold `◆` even if the caller handed in a live glyph

### Requirement: Thinking streams inline in the transcript then collapses in place
The system SHALL render assistant thinking inline in the transcript, inside the assistant message and in execution order (not in a widget below the transcript). While thinking is streaming the system SHALL show a single live line under the accent header, carrying a live token count and the elapsed time, in that order (for example `⠸ Thinking 1,234 tokens for 1.2s`), instead of the thinking text, so the block is exactly one row tall and the content below it never shifts; that line SHALL lead with the animated live glyph rather than `◆`, so the transcript’s longest-running row is recognisable as running; the count SHALL be an estimate of the accumulated thinking text and SHALL never decrease while a run streams, and the elapsed seconds SHALL be measured from the first thinking token of the run. When thinking for that turn ends the system SHALL replace that line in place with a single summary line carrying the duration and the final count, and that settled line SHALL lead with `◆` again. Pressing pi's tool-output expand control (`Ctrl+O`) SHALL expand the block in place to the full thinking text. The system MUST NOT strip or rewrite thinking content in the session or the model context.

#### Scenario: Thinking is in progress
- **WHEN** the model streams thinking tokens for the current assistant message
- **THEN** one line inside the assistant message shows the live glyph, the header, the token count so far, and the elapsed seconds so far (for example `⠸ Thinking 1,234 tokens for 0.8s`)
- **AND** the thinking text itself is not drawn while it streams
- **AND** the line stays exactly one row tall, so the content below it does not shift
- **AND** the count only grows and the clock only advances as the run grows
- **AND** no widget is mounted below the transcript for thinking

#### Scenario: Thinking completes
- **WHEN** thinking for the current assistant turn ends
- **THEN** the live line collapses in place to one summary line led by `◆`
- **AND** the summary shows the final count and, when it is known, the duration after it (for example `◆ Thought 1,234 tokens for 1.2s`)

#### Scenario: Thinking from a previous session is restored
- **WHEN** a resumed session renders thinking whose duration is unknown
- **THEN** the block collapses to a summary line led by `◆`, without a duration, but with the count of the run's text (for example `◆ Thought 1,234 tokens`)
- **AND** the extension MUST NOT render a live counter or a live glyph for it

#### Scenario: Thinking is hidden with pi’s control
- **WHEN** pi’s Hide thinking setting is enabled
- **THEN** pi renders the hidden-thinking label instead of the thinking block
- **AND** the extension MUST warn once per session, MUST NOT write the setting, and MUST still keep the label showing the collapsed summary with its `◆` marker

#### Scenario: User reveals full thinking
- **WHEN** the user presses pi’s tool-output expand control (`Ctrl+O`)
- **THEN** the thinking block expands in place to the full thinking text
- **AND** collapsing restores the one-line label
- **AND** full thinking text remains available in the stored assistant message, and the extension MUST NOT delete thinking from it


### Requirement: Non-mutation tools stream then collapse
While a built-in `bash`, `read`, `grep`, `find`, or `ls` call is running or streaming, the system SHALL show a one-line header and MUST NOT draw the call's output there, so the row's height is the same running and settled and the transcript below it does not move. While a call runs its header SHALL lead with the animated live glyph instead of `◆`, and the settled line SHALL lead with `◆` again. While a `bash` command runs, its header SHALL carry a live ` for 1.2s` clock that advances at least once a second. When `bash` finishes, the system SHALL collapse that call to its own single summary line whose verb turns past tense and whose clock settles (`Ran … for 1.2s`). Inspect tools follow the merge requirement instead of keeping one line per call. Full per-tool output MUST be available when tool output is expanded — for a still-running `bash` call that means every line printed so far.

#### Scenario: Bash is running
- **WHEN** the agent `bash` tool is executing and producing output
- **THEN** the row shows a header with the live glyph, a short run title or the command, and the elapsed seconds so far (for example `⠋ Run 检查依赖 for 2.1s`)
- **AND** no output line is drawn under it
- **AND** the clock keeps ticking while output is paused
- **AND** the row has no filled background box

#### Scenario: Running inspect call
- **WHEN** a `read`, `ls`, `grep`, or `find` call is in flight
- **THEN** its row is a one-line header led by the live glyph, carrying the tool name and its primary argument
- **AND** it does not join a merge line until it has settled

#### Scenario: Running row keeps its height
- **WHEN** a `bash` or inspect call goes from running to settled
- **THEN** the row draws the same number of lines before and after (the header alone, or the header plus the diff for an expanded `edit`/`write`)
- **AND** output that has printed so far is drawn only when the row is expanded

#### Scenario: Bash completes
- **WHEN** `bash` exits successfully
- **THEN** that call is a single line led by `◆`, whose verb is past tense and which carries the settled duration (for example `◆ Ran git status for 1.2s`)
- **AND** the live output viewport is not shown
- **AND** it MUST NOT be merged onto an inspect-tool summary line

#### Scenario: User expands a collapsed tool
- **WHEN** the user toggles pi’s tool-output expand control
- **THEN** each tool shows its own full captured output
- **AND** a `bash` call that is still running shows all of its output, under its live-glyph header
- **AND** toggling again restores the collapsed (and merged, for inspect tools) view

### Requirement: Consecutive inspect tools merge into one summary line
Completed `read`, `ls`, `grep`, and `find` calls that form one burst SHALL render as a single summary line, joining kinds with commas, and that settled line SHALL lead with `◆`. A burst is consecutive inspect tools with no intervening assistant text, `bash`, `edit`, or `write`. Same kind MUST be counted together. `read` SHALL list the paths it read — relative to the session, at most two of them, then a `+N` count for the rest — instead of a file count; the other kinds count by kind. Failed inspect calls MUST NOT be counted into the success summary; they keep their own error line. `edit` and `write` MUST NOT join a merge line.

#### Scenario: Mixed inspect burst
- **WHEN** a turn completes `read` 4 times, `ls` 3 times, and `grep` 15 times with no bash/edit/write/assistant text between them
- **THEN** the default view is one line equivalent to `◆ Read src/a.ts, test/b.test.ts +2, Listed 3 dirs, Searched 15 patterns`
- **AND** no file bodies, listings, or match dumps are shown
- **AND** a `read` whose path is unknown falls back to its file count (`Read 46 files`)

#### Scenario: Inspect tools split by bash
- **WHEN** the agent runs `read`, then `bash`, then `ls`
- **THEN** the default view is three rows: a read summary, a `Run …` line, and a listed-dirs summary
- **AND** read and ls MUST NOT share a line across the bash call

#### Scenario: Single inspect tool
- **WHEN** only one `read` completes in a burst
- **THEN** the line is equivalent to `◆ Read src/a.ts`

#### Scenario: Expand unmerges
- **WHEN** the user expands tool output on a merged inspect burst
- **THEN** each tool in the burst shows its own output
- **AND** collapsing restores the single merged line

### Requirement: Write and edit report the size of the change while streaming
While a `write` or `edit` call's arguments are still streaming, the row SHALL show a one-line header carrying the size of the change, updated as the arguments arrive: `write` counts the lines of the content received so far, and `edit` totals the old and new lines of every replacement in the call. That header SHALL lead with the animated live glyph while the call streams and with `◆` once it has settled. The counts stay on the header once the call settles, above the diff when the row is expanded. The counts MUST NOT be a second row, MUST NOT add a filled background, and MUST NOT change what the model or the session stores.

#### Scenario: Write streams its line count
- **WHEN** the model streams a `write` whose content has reached 128 lines
- **THEN** the header is equivalent to `⠋ Write src/a.ts  128 lines`
- **AND** the count grows as more content arrives and closes on the final line total

#### Scenario: Edit streams its old/new line counts
- **WHEN** the model streams an `edit` whose replacements total 3 old lines and 12 new lines
- **THEN** the header is equivalent to `⠋ Edit src/a.ts  −3 +12`
- **AND** the `−3` and the `+12` are drawn in the removed and added diff colors respectively

#### Scenario: Settled row keeps one header
- **WHEN** an `edit` or `write` call finishes
- **THEN** the row shows `◆` with the path and its counts exactly once, above the diff when expanded
- **AND** the header MUST NOT be repeated by the call and result renderers
- **AND** no live glyph remains on the row

#### Scenario: Expanded mutation row
- **WHEN** the user expands an `edit` or `write` row with the tool-output expand control
- **THEN** the header keeps the same path and counts, and the unified diff is drawn below it
- **AND** the streamed line counts are not shown a second time
