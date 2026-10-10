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
