# Shared form controls — 24 October 2026

## Delivered

- `SelectControl` and `SelectField` now use the product dropdown surface, stroke chevrons, consistent insets, option groups, selected tiles, optional search, and keyboard navigation. Existing `value`, `onChange(event.target.value)`, `option` and `optgroup` callers remain compatible.
- `ComboBoxField` replaces platform datalists. Known fields can display friendly labels while callbacks retain canonical API values. Unlisted API fields and values remain editable. Suggestions support pointer and keyboard selection, Escape, outside dismissal, disabled states and async option updates. Long suggestion lists use a 320 px height limit, with scrolling, so a field menu stays compact; calendar height remains independent.
- `Field type="datetime-local"` uses a shared date/time control: month/year navigation, keyboard calendar movement, UTC hour/minute/second input, Today, Clear and Apply. It preserves exact seconds and the ISO local callback contract. Partially typed text stays local; invalid completed dates block form submission rather than leaking into a query. Cancelling a drawer discards its uncommitted date text.
- Floating controls portal into the nearest open native dialog. This keeps them in its top layer without clipping the scrollable form. Their bounds follow the field and visual viewport, flip upward when space below is insufficient, and restore focus after Escape. One Escape closes the control before the enclosing dialog.
- Checkbox/radio painting and first-line alignment are shared. Numeric inputs have no platform spinner. File selectors use product button styling. Reduced-motion preferences are respected.
- Settings and host service/data controls use the shared selector. Mobile settings controls stretch to the common column width. The redundant inset frames around file date groups were removed, preserving room for a full timestamp and calendar button at 320 px.
- `ConfirmDialog` accepts optional `confirmHook`, passed to the confirming button as `data-onboarding`.

## Validation

| Check | Result |
| --- | --- |
| TypeScript | `npm run typecheck` passed |
| Date/calendar, existing search-date and file-model unit tests | 14 tests passed across 3 files |
| Chrome form-control browser suite | 8/8 passed |
| Firefox form-control browser suite | 8/8 passed |
| Final compact suggestion menu and initial ArrowUp follow-up | 1/1 passed in Chrome and 1/1 in Firefox |
| Keyboard modality regression after Firefox focus fix | Original 2/2 tests passed in Chrome and 2/2 in Firefox |
| Drawer selector accessibility scan | No WCAG A/AA violations reported |
| Dark calendar at 125% text accessibility scan | No WCAG A/AA violations reported |
| 320 and 390 px, 125% text | Popup bounds, full timestamp width, checkbox alignment and label interaction passed in both browsers |

The focused browser suite is `tests/e2e/form-controls.spec.ts`. It exercises actual visible controls, not hidden native selectors. `tests/e2e/helpers/controls.ts` provides `chooseOption(locator, value)` for the migrated suites.

The suite checks settings persistence; keyboard selection; outside dismissal; native-dialog ownership; Escape and focus restoration; valid UTC seconds; cancelling calendar drafts; invalid-date submit prevention; readable field labels; arbitrary API field preservation; month/year and leap-day selection; dark contrast; and mobile geometry.

Additional rendered review covered profile, security, active sessions, organization, appearance, avatar selection, new scan tasks and CSV import at 1440 and 320 px. The inspected forms stayed within the viewport. The profile and scanner data were local presentation fixtures; no remote account changes or scans were submitted.

## Review evidence

- `after/controls-tests/`: final Chrome screenshots for selectors, field suggestions, desktop/dark calendars, mobile calendar/menu and scanner checkbox states.
- `after/controls-firefox/`: the equivalent final Firefox evidence.
- `after/controls-review/`: settings/account/scanner form screenshots and `geometry.json`.

Issues found during the visual/browser pass were fixed: truncated calendar placement below a field with ample room above, file-date padding overriding the calendar button inset, duplicated fieldset indentation on narrow screens, selected-day hover contrast in dark appearance, unstyled file-picker buttons, and mobile settings wrappers still targeting native `select` elements.

The later immutable Firefox cross-browser gate found one additional focus regression: Firefox kept `:focus-visible` false after a pointer-opened custom select switched to arrow-key navigation. The select now uses the existing `data-input-modality="keyboard"` signal for its focused outline. The original modality tests pass in both engines: pointer focus stays quiet, keyboard focus becomes visible, and ordinary text editing stays quiet. This fix requires the final rebuild; the pre-fix immutable gate report remains separate in `/tmp/apcosys-final-firefox-gate/results.json` and the confirming regression report is `/tmp/apcosys-focus-fix/results.json`.

## Integration contract

Every mounted shared popup has `[data-control-popup]`. Subtypes use `.select-popover`, `.combobox-popover` and `.calendar-popover`. The select trigger is `button.form-select-trigger[role="combobox"]`, exposes canonical `data-control-value`, and emits one bubbling DOM `change` event after selection for guided scenarios. Calendar triggers are `.date-control-trigger[aria-expanded="true"]` while open.

Date text fields accept either `YYYY-MM-DDTHH:mm:ss` or `YYYY-MM-DD HH:mm:ss`; their callback remains ISO with `T`, while the visible text uses a space after blur. Existing date consumers in Search and Files use controlled callbacks. A filter reset should also call the containing form's `reset()` if it must discard incomplete local text while the controlled value is already empty.

No dependencies were added. No publication or commit was made by the controls workstream.
