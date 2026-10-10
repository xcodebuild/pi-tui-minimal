## MODIFIED Requirements

### Requirement: Thinking streams inline in the transcript then collapses in place

The system SHALL render assistant thinking inline in the transcript, inside the assistant message and in execution order (not in a widget below the transcript). While thinking is streaming the system SHALL show a `◆ Thinking` header plus at most 3 visible lines of the newest thinking text, auto-scrolling to the latest line, and when thinking for that turn ends the system SHALL replace that block in place with a single summary line. The header, the visible lines, and the collapsed summary SHALL use the theme's dim foreground, and the summary SHALL start with the same diamond marker as a tool row. The system MUST NOT strip or rewrite thinking content in the session or the model context, and MUST NOT change how pi styles the text of the thinking block itself.

#### Scenario: Thinking is in progress

- **WHEN** the model streams thinking tokens for the current assistant message
- **THEN** a `◆ Thinking` header and the newest 3 thinking lines are visible inside the assistant message
- **AND** new lines replace the oldest visible line (tail scroll)
- **AND** no widget is mounted below the transcript for thinking

#### Scenario: Thinking completes

- **WHEN** thinking for the current assistant turn ends
- **THEN** the thinking block collapses in place to one summary line
- **AND** the summary starts with the diamond marker and shows the duration when it is known (for example `◆ Thought for 1.2s`)

#### Scenario: Thinking from a previous session is restored

- **WHEN** a resumed session renders thinking whose duration is unknown
- **THEN** the block collapses to a diamond-prefixed summary line without a duration (for example `◆ Thought`)
- **AND** the extension MUST NOT rerender the running tail for it

#### Scenario: Thinking text is dim

- **WHEN** thinking is visible, running or collapsed
- **THEN** its text is rendered in the theme's dim foreground rather than a distinct thinking color
- **AND** the styling is limited to thinking text and does not change the color of assistant prose or tool output

#### Scenario: Thinking is hidden with pi’s control

- **WHEN** pi’s Hide thinking setting is enabled
- **THEN** pi renders the hidden-thinking label instead of the thinking block
- **AND** the extension MUST warn once per session, MUST NOT write the setting, and MUST still keep the label showing the collapsed summary
- **AND** that label is dim and carries the diamond marker

#### Scenario: User reveals full thinking

- **WHEN** the user uses pi’s existing hide/show thinking control
- **THEN** full thinking text remains available in the stored assistant message
- **AND** the extension MUST NOT delete thinking from the stored assistant message
