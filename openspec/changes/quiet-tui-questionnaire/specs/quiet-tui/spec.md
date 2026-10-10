## ADDED Requirements

### Requirement: Third-party tool rows that cannot be registered still collapse
A tool row registered by another extension SHALL render as one `◆` line in the quiet style when that tool's row shape is recognised, even though its tool definition cannot be re-registered (pi keeps the first registration per tool name). The extension MUST NOT change the tool's execution, its model-visible result, or the row's behavior for a tool it does not recognise, and MUST fall back to pi's own rendering when the row's shape is not recognised.

#### Scenario: Questionnaire waits for the user
- **WHEN** the `ask_user_question` tool is running and the questionnaire overlay is open
- **THEN** its transcript row is one line of the form `◆ Asking <chips>`, where `<chips>` are the model's `header` values in call order
- **AND** the row has no filled background, no indent, and no blank line above or below it
- **AND** the overlay the user answers in is unaffected

#### Scenario: Questionnaire is answered
- **WHEN** the user submits answers
- **THEN** the row becomes one line of the form `◆ Asked <chips>`
- **AND** neither the answer envelope nor a `(N more lines, … to expand)` hint is shown by default

#### Scenario: Questionnaire is declined
- **WHEN** the user abandons the questionnaire
- **THEN** the row becomes one line of the form `◆ Asked <chips>  declined`

#### Scenario: Questionnaire cannot be rendered
- **WHEN** the tool fails (no UI, invalid questionnaire, or a failed UI load)
- **THEN** the row is one line in the form `◆ ask_user_question  <detail>` using the theme's `error` color

#### Scenario: Questionnaire row is expanded
- **WHEN** the user expands tool output on a questionnaire row
- **THEN** the row shows the state line followed by one `"<chip>"="<answer>"` line per answer, using the question text when no chip is recorded, and a `notes: …` line where the user added notes
- **AND** a multi-select answer is joined into one line and an empty answer reads `(no input)`

#### Scenario: A questionnaire with no chips
- **WHEN** the questions carry empty or missing `header` values
- **THEN** the `<chips>` placeholder becomes `1 question` or `N questions`

#### Scenario: A row from a session without stored answers
- **WHEN** an expanded questionnaire row has no recorded answer details
- **THEN** the row still shows the state line and the result text rather than nothing

#### Scenario: A row the extension does not recognise
- **WHEN** any other tool row (a subagent, goal, or fuzzy-search tool) renders
- **THEN** it keeps its own renderer and layout
- **AND** only its filled background is removed

### Requirement: Rows that interrupt the transcript end an inspect burst
A tool row that is not an inspect tool but occupies the transcript on its own SHALL end the current inspect burst, so inspect calls on either side of it do not merge into one summary line.

#### Scenario: Read, questionnaire, read
- **WHEN** the agent reads a file, asks a question, then reads another file
- **THEN** the transcript shows a read summary, the questionnaire line, and a second read summary
- **AND** the two reads MUST NOT share one merged `Read 2 files` line
