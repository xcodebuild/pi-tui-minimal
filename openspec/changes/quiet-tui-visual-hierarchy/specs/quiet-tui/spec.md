## ADDED Requirements

### Requirement: Row layout uses a gutter and a metric column
Stacked agent output rows (tool rows and their expanded output, thinking labels, questionnaire rows, and rows belonging to tools the extension does not register) SHALL be indented by a two-column gutter, while the user's own prompt keeps the `❯` marker in the first column, so prose and machinery are distinguishable without reading the marker. Thinking labels SHALL keep that gutter whether or not they carry a duration. A row whose text is wider than the transcript SHALL wrap with a hanging indent: continuation lines align under the row body rather than returning to the first column. Numbers a row carries as a measurement — an elapsed clock, a thinking token count, added/removed line counts, a `write` line count, an exit code — SHALL be drawn dim and separated from the title by at least two columns. Measurements on titles that fit before the 80-column metric rail SHALL be right-aligned on that rail. Titles SHALL still use the transcript's actual width and MUST NOT wrap at the metric rail; when a title crosses the rail, its measurement SHALL follow after the minimum gap instead. When the title and the metric cannot share one line, the metric SHALL take a right-aligned line of its own below the wrapped title, and MUST NOT be truncated away. The gutter, the hanging indent, and the metric column MUST NOT add a filled background or change the row's line count between its running and settled views.

#### Scenario: Prose and machinery are separated
- **WHEN** a turn draws an assistant text block and a collapsed tool row
- **THEN** the tool row and any expanded output below it start in the second column
- **AND** the user's prompt line still starts with `❯` in the first column

#### Scenario: A long title wraps under its own body
- **WHEN** a collapsed row's title is wider than the transcript
- **THEN** the first line starts with the gutter and the marker
- **AND** every continuation line is indented past the marker so the marker column stays a clean rail

#### Scenario: Metrics line up down the transcript
- **WHEN** several collapsed rows carry measurements (a clock, a token count, `+N −M`, `exit N`) and their titles fit before the metric rail
- **THEN** each measurement is right-aligned in the same column with at least two columns of gap after its title
- **AND** each measurement is drawn in the theme's `dim` slot

#### Scenario: A wide transcript keeps the metric nearby
- **WHEN** the transcript is wider than 80 columns
- **THEN** a short row's metric aligns within an 80-column rail from the left edge
- **AND** a longer title may extend beyond that rail without wrapping early
- **AND** its metric follows after the minimum gap instead of being pushed to the physical right edge of the terminal

#### Scenario: The metric survives a narrow transcript
- **WHEN** a row's title leaves no room for its metric on the same line
- **THEN** the title wraps and the metric is drawn right-aligned on a following line
- **AND** the metric is not dropped and not truncated

### Requirement: Row styling uses a marker table, accent, and weight
The extension SHALL give each one-line row a scannable anchor using foreground color, weight, and a marker. Markers SHALL be drawn from a small closed set, one per row state: `◆` for a settled row, the animated live glyph for a running row, `·` for a thinking label, and `×` for a failed row. On a settled tool row the `◆` marker and the action word SHALL be accented and bold, and the action word SHALL be capitalized the same way on every row (`Run`, `Read`, `Listed`, `Edit`, `Write`); counts and paths SHALL be bold; descriptions, merge nouns, and command text SHALL stay in the theme's `dim` slot; and added and removed line counts SHALL be drawn in pi's `toolDiffAdded` and `toolDiffRemoved` colors so the two never look alike. A thinking label SHALL use the light `·` marker with no accent and no bold, so meta-commentary does not compete with actions. Emphasis MUST NOT add a filled background, a multi-character prefix, or any decoration beyond those colors, weight, and `dim`.

#### Scenario: Run row leads with its action
- **WHEN** a `bash` row is collapsed to its summary line
- **THEN** the `◆` marker and `Ran` are accented and bold
- **AND** the run title or command text is dim
- **AND** the elapsed clock is drawn in the dim metric column, with no weight or accent of its own

#### Scenario: Merged inspect row separates counts from nouns
- **WHEN** a burst merges into `Listed 3 dirs, Searched 15 patterns`
- **THEN** each kind name is accented and bold
- **AND** each count is bold
- **AND** the nouns (`dirs`, `patterns`) and the separator commas are dim

#### Scenario: Merged read row lists paths
- **WHEN** a burst merges reads into `Read src/a.ts, test/b.ts +44 more`
- **THEN** `Read` is accented and bold
- **AND** the listed paths are bold
- **AND** a trailing `+44 more` count of the paths the row does not list is dim

#### Scenario: Path and counts are readable on a diff row
- **WHEN** an `edit` or `write` row is shown with its `+N/−M` counts
- **THEN** the path is bold
- **AND** one count per sign is drawn in its diff color (`toolDiffAdded` for `+N`, `toolDiffRemoved` for `−M`) in the metric column
- **AND** a path containing spaces is bolded whole, not split at the first space

#### Scenario: Thinking labels step back
- **WHEN** thinking streams or collapses
- **THEN** the label opens with `·` drawn dim, with no accent and no bold
- **AND** the word (`Thinking`, `Thought`) is dim rather than accented
- **AND** the token count stays plain and dim rather than bold, and keeps the thinking color rather than the terminal default
- **AND** the duration is drawn in the dim metric column
- **AND** the hidden-thinking label uses the same light form

### Requirement: Transcript spacing marks phase boundaries
The extension SHALL remove repetitive blank spacers between tool rows and thinking labels, while preserving exactly one blank line where actual assistant prose meets a tool row or thinking label. A sequence that alternates thinking and tools SHALL remain compact with no inserted blank between those execution rows. Paragraph breaks inside assistant prose SHALL remain unchanged.

#### Scenario: Execution rows remain compact
- **WHEN** a thinking label and one or more tool rows appear consecutively
- **THEN** no blank line is drawn between those rows

#### Scenario: Prose begins after execution
- **WHEN** assistant prose follows a tool row or thinking label
- **THEN** exactly one blank line separates the prose from the execution row

#### Scenario: Execution begins after prose
- **WHEN** a tool row follows assistant prose
- **THEN** exactly one blank line separates the tool row from the prose

#### Scenario: An unrecognised row shape still renders
- **WHEN** a header does not match any known shape
- **THEN** the `◆` and the first word are accented and bold and the remainder is dim
- **AND** no text from the row is dropped or reordered

### Requirement: Consecutive fast runs merge into one summary line
Consecutive `bash` runs that each settled in under one second and that have no intervening assistant text, `edit`, `write`, or inspect row SHALL render as a single summary line instead of one row each. The merged line SHALL carry a past-tense run verb, the number of commands it covers, and up to two of their descriptions followed by a `+N more` count for the rest (for example `Ran 3 commands: git status, npm test +2 more`); the merged line's metric column SHALL carry the total elapsed time of the covered runs. A run that took one second or more SHALL keep its own row and SHALL end the merge, so work that took real time is never hidden inside a summary. The merged line SHALL belong to the first covered run, the way an inspect burst belongs to its first success. Failed runs MUST NOT be counted into a merged line; they keep their own error row. Expanding tool output SHALL unmerge the covered runs, and collapsing SHALL restore the single merged line.

#### Scenario: Three quick runs collapse to one line
- **WHEN** three `bash` calls each settle in under a second with no assistant text, `edit`, `write`, or inspect row between them
- **THEN** the default view is one line naming the command count and their descriptions (for example `Ran 3 commands: git status, npm test +1 more`)
- **AND** the total elapsed time of the three runs is right-aligned in the metric column
- **AND** no command output is shown

#### Scenario: A slow run keeps its own row
- **WHEN** a `bash` call settles after two seconds
- **THEN** it keeps its own `Ran …` row with its own clock
- **AND** runs before and after it do not merge across it

#### Scenario: Assistant text ends the merge
- **WHEN** the model writes assistant text between two quick runs
- **THEN** the two runs MUST NOT share a merged line

#### Scenario: A failed quick run keeps its own row
- **WHEN** a quick `bash` call exits non-zero inside a run of otherwise successful quick runs
- **THEN** the failure keeps its own error row
- **AND** the remaining successful runs still merge

#### Scenario: Expanding unmerges runs
- **WHEN** the user expands tool output on a merged run line
- **THEN** each covered run shows its own header and its own captured output
- **AND** collapsing restores the single merged line

### Requirement: Read, grep, and list rows keep their file name
A path shown on a collapsed row SHALL be shortened so that the file's own name survives; a path too long for its column SHALL be elided in the middle (for example `src/very/…/file.ts`) rather than cut from the end. A path under the session's working directory SHALL be shown relative to it, and a path under the home directory SHALL be shown with a `~` prefix. An expanded row SHALL keep the same shortening rule instead of printing a full absolute path, and SHALL shorten from the left when the path still does not fit, so the file name is the last thing to be given up.

#### Scenario: A deep path keeps its basename
- **WHEN** a `read` row shows a path longer than the row's path column
- **THEN** the path is elided in the middle and ends with the file's name and extension

#### Scenario: Expanded rows stay relative
- **WHEN** the user expands a row whose path is inside the session's working directory or the home directory
- **THEN** the path stays working-directory-relative or `~`-prefixed
- **AND** the row MUST NOT print a full absolute path for those files

#### Scenario: A path outside both roots
- **WHEN** a row's path is neither under the session's working directory nor under the home directory
- **THEN** the path is shown with its leading directories elided and its file name intact

### Requirement: Theme keeps a readable foreground ladder
The quiet theme SHALL define three foreground steps that are distinguishable from each other on a dark terminal — the step used for assistant prose, the step used for tool output, and the step used for `dim` chrome — and SHALL set its `text` token to an explicit value rather than leaving it to the terminal default. Added and removed line counts SHALL remain distinguishable from each other by color alone, the error color SHALL remain distinguishable from the accent color, and the marker for a running row MUST NOT be drawn in the same slot as a warning, so the most saturated element on screen is never a spinner.

#### Scenario: Three foreground steps are distinct
- **WHEN** the theme is loaded
- **THEN** assistant prose, tool output, and `dim` chrome each resolve to a different color
- **AND** the `text` token resolves to a declared color rather than the terminal default

#### Scenario: A running row is not the loudest element
- **WHEN** a row is running and other rows are settled
- **THEN** the running marker is drawn from a non-warning slot
- **AND** the running row's own title is drawn one step brighter than a settled row's title

#### Scenario: Diff and error colors stay distinct
- **WHEN** added and removed line counts are shown, and when an error row is shown
- **THEN** the two diff colors are distinguishable from each other and from the error color in grayscale as well as in color

## MODIFIED Requirements

### Requirement: Thinking streams inline in the transcript then collapses in place
The system SHALL render assistant thinking inline in the transcript, inside the assistant message and in execution order (not in a widget below the transcript). While thinking is streaming the system SHALL show a single live line under a light `· Thinking` label, carrying a live token count and the elapsed time, in that order (for example `· Thinking 1,234 tokens 2.1s` with the clock in the metric column), instead of the thinking text, so the block is exactly one row tall and the content below it never shifts; the count SHALL be an estimate of the accumulated thinking text and SHALL never decrease while a run streams, and the elapsed seconds SHALL be measured from the first thinking token of the run. When thinking for that turn ends the system SHALL replace that line in place with a single summary line carrying the final count and, when it is known, the duration. Pressing pi's tool-output expand control (`Ctrl+O`) SHALL expand the block in place to the full thinking text. The system MUST NOT strip or rewrite thinking content in the session or the model context.

#### Scenario: Thinking is in progress
- **WHEN** the model streams thinking tokens for the current assistant message
- **THEN** one line inside the assistant message shows the `· Thinking` label, the token count so far, and the elapsed seconds so far
- **AND** the thinking text itself is not drawn while it streams
- **AND** the line stays exactly one row tall, so the content below it does not shift
- **AND** the count only grows and the clock only advances as the run grows
- **AND** the thinking label remains visible even when the token count is small
- **AND** no widget is mounted below the transcript for thinking

#### Scenario: Thinking completes
- **WHEN** thinking for the current assistant turn ends
- **THEN** the live line collapses in place to one `· Thought` summary line
- **AND** the summary shows the final count in the row and, when it is known, the duration in the metric column

#### Scenario: Thinking from a previous session is restored
- **WHEN** a resumed session renders thinking whose duration is unknown
- **THEN** the block collapses to a `· Thought` summary line without a duration, but with the count of the run's text
- **AND** the extension MUST NOT render a live counter for it

#### Scenario: Thinking is hidden with pi’s control
- **WHEN** pi's Hide thinking setting is enabled
- **THEN** pi renders the hidden-thinking label instead of the thinking block
- **AND** the extension MUST warn once per session, MUST NOT write the setting, and MUST still keep the label showing the collapsed summary

#### Scenario: User reveals full thinking
- **WHEN** the user presses pi's tool-output expand control (`Ctrl+O`)
- **THEN** the thinking block expands in place to the full thinking text
- **AND** collapsing restores the one-line label
- **AND** full thinking text remains available in the stored assistant message, and the extension MUST NOT delete thinking from it

### Requirement: Non-mutation tools stream then collapse
While a built-in `bash`, `read`, `grep`, `find`, or `ls` call is running or streaming, the system SHALL show a one-line header and MUST NOT draw the call's output there, so the row's height is the same running and settled and the transcript below it does not move. While a `bash` command runs, its header SHALL carry a live clock in the metric column once the run has lasted at least one second. When `bash` finishes, the system SHALL collapse that call to its own single summary line whose verb turns past tense and whose clock settles beside it (`Ran …` with the duration in the metric column). A run that settled in under one second SHALL be shown without a clock, so a sub-second measurement is never drawn as `0.0s`. Inspect tools follow the merge requirement instead of keeping one line per call. While a row is running, its title SHALL be drawn in a brighter foreground step than a settled row's dim title, so the row that is moving is the row the eye finds first. Full per-tool output MUST be available when tool output is expanded — for a still-running `bash` call that means every line printed so far.

#### Scenario: Bash is running
- **WHEN** the agent `bash` tool has been executing for more than a second
- **THEN** the row shows a header with a short run title or the command and the elapsed seconds so far right-aligned in the metric column
- **AND** the running row's title is drawn brighter than a settled row's title
- **AND** no output line is drawn under it
- **AND** the clock keeps ticking while output is paused
- **AND** the row has no filled background box

#### Scenario: A quick run carries no clock
- **WHEN** a `bash` call settles in under one second
- **THEN** its collapsed line shows the action and title with no time measurement
- **AND** the transcript MUST NOT contain a `0.0s` clock for it

#### Scenario: Running row keeps its height
- **WHEN** a `bash` or inspect call goes from running to settled
- **THEN** the row draws the same number of lines before and after (the header alone, or the header plus the diff for an expanded `edit`/`write`)

#### Scenario: Bash completes
- **WHEN** `bash` exits successfully after at least a second
- **THEN** that call is a single line whose verb is past tense and which carries the settled duration in the metric column
- **AND** the live output viewport is not shown
- **AND** it MUST NOT be merged onto an inspect-tool summary line

#### Scenario: User expands a collapsed tool
- **WHEN** the user toggles pi's tool-output expand control
- **THEN** each tool shows its own full captured output
- **AND** a `bash` call that is still running shows all of its output
- **AND** toggling again restores the collapsed (and merged, for inspect tools) view

### Requirement: Write and edit report the size of the change while streaming
While a `write` or `edit` call's arguments are still streaming, the row SHALL show a one-line header carrying the size of the change, updated as the arguments arrive: `write` counts the lines of the content received so far, and `edit` totals the old and new lines of every replacement in the call. While the counts are on the row they SHALL be drawn in the dim metric column rather than inline with the path. The counts stay on the header once the call settles, above the diff when the row is expanded. The counts MUST NOT be a second row, MUST NOT add a filled background, and MUST NOT change what the model or the session stores.

#### Scenario: Write streams its line count
- **WHEN** the model streams a `write` whose content has reached 128 lines
- **THEN** the header is `◆ Write src/a.ts` with `128 lines` right-aligned in the metric column
- **AND** the count grows as more content arrives and closes on the final line total

#### Scenario: Edit streams its old/new line counts
- **WHEN** the model streams an `edit` whose replacements total 3 old lines and 12 new lines
- **THEN** the header is `◆ Edit src/a.ts` with `−3 +12` right-aligned in the metric column
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
A failed or aborted tool call SHALL collapse to a single error summary line using the `×` marker (tool name, primary argument, and exit code or error text). Expanded view SHALL show the captured output or error details. The system MUST NOT keep a tall error dump in the default view. The collapsed line SHALL keep the theme's `error` color and SHALL bold its `×` marker, the tool or action name, and the trailing exit code or error status, without adding a second hue; the exit code or error status SHALL be drawn in the metric column.

#### Scenario: Bash non-zero exit
- **WHEN** `bash` exits with a non-zero code
- **THEN** the collapsed row is one line opening with `×`, including the command, with the exit code right-aligned in the metric column
- **AND** stdout/stderr are visible only when expanded

#### Scenario: Edit or write failure
- **WHEN** `edit` or `write` fails
- **THEN** the default view is one error line for that path
- **AND** no partial diff is presented as success

#### Scenario: Failed row reads as a failure
- **WHEN** a tool call fails or a run exits non-zero
- **THEN** the row opens with `×` rather than `◆`
- **AND** the row keeps the theme's `error` color
- **AND** the `×` marker, the tool or action name, and the exit-code or error status are bold

### Requirement: Bash rows stay separate
A `bash` call that ran for at least one second, or that was followed by assistant text, an `edit`, a `write`, or an inspect row, SHALL keep its own row while running and after it completes, and MUST NOT be merged onto an inspect summary line. A run of consecutive `bash` calls that each settled in under one second MAY share one merged row, under the conditions in the run-merging requirement; such a merged row MUST NOT also absorb inspect summaries.

#### Scenario: A slow bash call
- **WHEN** a `bash` call runs for two seconds
- **THEN** it has its own header with its own live clock while running
- **AND** it collapses to its own `Ran …` line with the duration in the metric column

#### Scenario: Two bash calls
- **WHEN** two `bash` calls run in the same turn
- **THEN** each has its own header with its own live clock while running
- **AND** each settles to its own `Ran …` line when it took at least a second
- **AND** two runs that both settled in under a second MAY share one merged run line instead, with the total time in the metric column

#### Scenario: Bash never joins an inspect summary
- **WHEN** a `bash` call sits between two inspect bursts
- **THEN** the inspect bursts remain separate summary lines
- **AND** no inspect count is added to the run's line

## REMOVED Requirements

### Requirement: Row emphasis uses accent and weight
**Reason**: The contract is restated as "Row styling uses a marker table, accent, and weight". The old requirement names exactly one marker (`◆`) and lists `Thought` among the capitalized, accented action words; both are now wrong, because a row's marker identifies its state (`◆` settled, live glyph running, `·` thinking, `×` failed) and a thinking label is deliberately unaccented. Every scenario is carried over, except the one that asserted thinking labels are accented, which is replaced by "Thinking labels step back".
**Migration**: No user action. The restated requirement covers the same rows with the same accent, weight, and `dim` rules; the only behavior change is the thinking label and the failed row, which are specified in the restated requirement and in "Errors stay one line until expanded".
