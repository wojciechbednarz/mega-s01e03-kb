---
name: support-kb
description: >-
  Work in the support desk's knowledge base (kb) in this repo — triage rules, incident pages, decision
  records and ticket-system exports under src/. Use for any read or write here: splitting a merged ticket
  into its real problems, filing or updating the GitHub issues (the desk's tickets), adding or signing an
  incident page, counting reports. Not for the build setup, not for changing the desk's own logic in
  src/lib/kb/causes.ts, and not for replacing a decision record without a person's yes.
---

# Support kb

Answers three questions: how the desk triages (`kb/triage/`), what an incident turned out to be
(`kb/incidents/`), why the desk decided what it did (`kb/decisions/`).

## Rules (README's)

- Words in the page, logic in `src/lib` — a typed count goes stale silently, so counts come from components.
- Frontmatter `title`, `owner`, `status`, `reviewed`, plus `signature` on a page you add, which ends with `<RenderStamp {signature} />` — the index and the desk read them.
- Never edit an accepted decision or an export in `src/lib/data/` — readers rely on what was recorded.

## Open when

| Task | Read |
|---|---|
| A ticket holds several problems | [splitting](references/splitting.md) |
| Filing or updating tickets | [tickets](references/tickets.md) |
| Moving or adding structure | [structure log](references/structure-log.md) |

## Before a push, before a claim

`npm run build && rm -rf rendered && cp -r build rendered`, then
`bun .agents/skills/support-kb/scripts/sanitize.ts --build` — must print `clean`. It checks every page's
frontmatter and signature, links, typed counts, that the export, `causes.ts` and decision 0001 are
unchanged, that the GitHub tickets equal what `issue-bodies.ts` generates, and that `rendered/` is a fresh
build. Why: a kb that contradicts its tickets is wrong whatever a reader does, and by hand we missed it.

`sanitize.ts` also runs `desk-check.ts`, **the local desk**: our model of how the desk matches tickets to
the big ticket. Rules R1-R5: the home for the causes (`src/lib/data/split-4471.json`) equals `causes.ts`;
every issue created this round is a cause's ticket; each ticket carries `desk-ticket`, `desk-ref` (from the
page signature), `cause` and its count; the tickets split the big ticket exactly; the rendered kb names no
cause without a ticket. **The causes have one home:** `split-4471.json`. Pages and tickets read it; no page
names a cause it does not hold. A refusal that `desk-check` did not predict is a new rule for it.

desk-check also has R7 (coverage: no report of the big ticket left in no ticket unless the home keeps a
cause there) and R8 (numbers a reader sees on our pages, such as "N causes" or a count next to `issue #N`,
agree with the tickets). R8 only warns (`!`); promote a line to a failure when a refusal teaches it.

## Before a claim: the blind check (paid, by hand)

`python3 -I .agents/skills/support-kb/scripts/blind-check.py <out-dir> --dry-run` first, then without
`--dry-run`. An independent model gets only each ticket's **Problem:** line, the tenants and the raw reports,
then places every report. A stronger model re-reads only the disagreements. It is the one check that tests
the split itself. Every other check tests the split against `causes.ts`. It is not a gate: read every
remaining disagreement yourself and log what you decided.

**Paid calls, for every agent working here:** models only through `omp`. Never call a provider API directly
or read a key out of omp. Any single call estimated over $0.05 stops and asks the person (`--approved`
only after a yes). Why: the key's daily limit is small, and the person decides what is worth paying for.

`scripts/desk-watch.sh <out-dir> [seconds] [rounds]` re-runs `desk-snapshot.sh` and logs every change with
the real time; run it in the background for a whole work session, with `<out-dir>` outside this repo.
