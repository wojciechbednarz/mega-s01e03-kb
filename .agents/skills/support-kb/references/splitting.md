# Splitting a merged ticket

Read each report for **which fix would stop it**, not its subject or tenant: decision 0001 merges by
subject and `causes.ts` files by tenant, and neither reads the body — that is how one ticket ends up
holding several problems.

Place every report, strongest evidence first (`#lib/kb/symptoms`, `place()`):

1. **text** — the body's dates: day and month swapped, or one day apart. Proof.
2. **desk** — the desk's own record (`desk-notes.json`).
3. **inferred** — last resort: the symptom shared by same-tenant, same-channel siblings placed by 1–2 (at least `MIN_SIBLINGS`, `MIN_SHARE` agreeing). It describes the customer, not the report, so it runs last, is labelled, and never feeds another inference.

Cause: a swap through a booking-v3 form from a day-first tenant is `hint` (`causeOf`), any other swap is
`parser`; a one-day move is `time-zone`.

The split page lives beside the original (`incidents/<ticket>-split/`), and the original gets a one-line
pointer to it: the split is a new reading, not an edit of what the desk recorded.
