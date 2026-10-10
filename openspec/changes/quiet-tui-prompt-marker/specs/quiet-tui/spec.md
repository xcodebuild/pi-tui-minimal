## ADDED Requirements

### Requirement: The user's own turn carries one marker

While the extension is loaded, the transcript SHALL anchor the user's prompt with a single `❯` on the first line that carries text, styled bold in the theme's `accent` slot, because the no-fill requirement removes the background rectangle pi paints there. The marker SHALL be paid for by the prompt's own left padding, so the row keeps its line count and does not exceed the available width. The extension MUST NOT rewrite any other line of the prompt, MUST NOT change what pi rendered there (Markdown, tables, code blocks, wraps), and MUST NOT paint a filled background.

#### Scenario: User turn is marked

- **WHEN** the user submits a prompt
- **THEN** the first line of the prompt that carries text begins with the accented, bold `❯`
- **AND** the prompt renders with no filled background rectangle
- **AND** the row's line count is unchanged and every line is at most `width` columns

#### Scenario: The padding pays for the marker

- **WHEN** the prompt's first text line is padded on the left
- **THEN** up to two of those padding columns are spent on the marker and its gap, so the row's visible width does not grow
- **AND** any shortfall is taken off the row's trailing filler, so the prompt never gains a row

#### Scenario: Prompt is submitted before any output exists

- **WHEN** a turn has mounted the prompt but no assistant message or tool row yet
- **THEN** the transcript patch is installed from the prompt itself, so the marker is on screen from the moment the prompt is

#### Scenario: Prompt carries no text

- **WHEN** a restored prompt holds no line with visible text
- **THEN** it renders unchanged

#### Scenario: Other rows are unaffected

- **WHEN** the transcript renders assistant messages and tool rows
- **THEN** they keep their own quiet rendering and no `❯` is added to them

#### Scenario: Row shape is not recognised

- **WHEN** the prompt component does not expose the fields the marker keys off
- **THEN** the prompt keeps pi's own rendering instead of failing
