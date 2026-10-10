## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Row emphasis uses accent and weight
The extension SHALL give each one-line row a scannable anchor using foreground color, weight, and one `◆` marker. On a tool row the `◆` marker and the action word SHALL be accented and bold; counts, paths and durations SHALL be bold; descriptions, merge nouns and command text SHALL stay in the theme’s `dim` slot. Thinking labels SHALL be accented the same way. Emphasis MUST NOT add a filled background, a multi-character prefix, or any decoration beyond accent, weight, and `dim`.

#### Scenario: Run row leads with its action
- **WHEN** a `bash` row is collapsed to its summary line
- **THEN** the `◆` marker and `Run` are accented and bold
- **AND** the run title or command text is dim

#### Scenario: Merged inspect row separates counts from nouns
- **WHEN** a burst merges into `Read 46 files, Listed 3 dirs`
- **THEN** each kind name is accented and bold
- **AND** each count is bold
- **AND** the nouns (`files`, `dirs`) and the separator commas are dim

#### Scenario: Path and counts are readable on a diff row
- **WHEN** an `edit` or `write` row is shown with its `+N/−M` counts
- **THEN** the path and the counts are bold
- **AND** a path containing spaces is bolded whole, not split at the first space

#### Scenario: Thinking labels are accented
- **WHEN** thinking streams or collapses
- **THEN** the `◆` and the word (`Thinking`, `Thought`) are accented and bold
- **AND** a known duration is bold and keeps the thinking color rather than the terminal default
- **AND** the hidden-thinking label uses the same accented form

#### Scenario: An unrecognised row shape still renders
- **WHEN** a header does not match any known shape
- **THEN** the `◆` and the first word are accented and bold and the remainder is dim
- **AND** no text from the row is dropped or reordered
