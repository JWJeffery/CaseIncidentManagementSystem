# Reunification Test Plan

## Current automated tests

Run:

```bash
npm test
```

Current coverage includes the CSV import adapter:

- quoted CSV cells and embedded commas
- Synergy-style grouped headers
- flat SIS exports
- release flag normalization
- missing student ID rows
- students with no authorized release contact

Current coverage also includes the pure workflow module:

- approval is required before reunifier handoff
- reunifier handoff is required before final release
- approval copies claimant-entered values into the lower release section
- release completion records release time
- new-card reset clears match, evidence, name read, and card fields

The browser UI now calls the pure workflow module for approval, reject/escalate, reunifier handoff, release completion, and new-card reset. The remaining gap is browser-level smoke testing; the transition rules themselves are no longer duplicated only in `main.js`.

## Manual smoke test

1. Start the app with `npm start`.
2. Open `http://localhost:8000`.
3. Confirm the dashboard renders.
4. Fill the claimant side of the Reunification Card manually.
5. Confirm no SIS data fills the claimant card before staff approval.
6. Capture or upload an evidence image.
7. Enter a name read from evidence and compare it against the claimant pickup name.
8. Search for a student record.
9. Select an authorized release contact.
10. Approve the SIS match.
11. Confirm the lower release section copies claimant-entered values, not SIS values.
12. Send to Reunifier.
13. Complete Release.
14. Export the record and confirm it contains claimant entry, staff fields, release fields, selected student/contact, dashboard state, import issues, and recent log entries.
15. Use New Card and confirm the card/evidence/match state clears.

## Next test targets

- Add sample real-district CSV fixtures after field audit.
- Add OCR adapter contract tests before adding a real OCR provider.
- Add browser smoke tests once the app moves to a framework or testable component boundary.
