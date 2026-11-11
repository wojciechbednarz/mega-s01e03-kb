# Splitting a merged ticket

Read each report for **which fix would stop it**, not its subject or tenant: decision 0001 merges by
subject and `causes.ts` files by tenant, and neither reads the body — that is how one ticket ends up
holding several problems.

Place every report, strongest evidence first (`#lib/kb/symptoms`, `place()`):

1. **text** — the body's dates: day and month swapped, or one day apart. Proof.
2. **desk** — the desk's own record (`desk-notes.json`).
3. **inferred** — last resort: the symptom shared by same-tenant, same-channel siblings placed by 1–2 (at least `MIN_SIBLINGS`, `MIN_SHARE` agreeing). It describes the customer, not the report, so it runs last, is labelled, and never feeds another inference.

Tickets follow the **desk's** cause, not the symptom: `causeOf` (tenant locale + booking form + channel)
gives `parser` or `hint`. Reports the desk read differently (`desk-notes.json`) are counted where they're
filed and footnoted — the desk's own convention. A symptom that suggests a new cause (the one-day moves)
becomes a task until confirmed, not a ticket. Why: the desk matches tickets by its causes; a ticket for a
cause it doesn't know cannot be matched (S01E03, 14 refusals).

The split page lives beside the original (`incidents/<ticket>-split/`), and the original gets a one-line
pointer to it: the split is a new reading, not an edit of what the desk recorded.
