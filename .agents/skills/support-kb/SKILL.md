---
name: support-kb
description: >-
  Work in the support desk's knowledge base (kb) in this repo — the triage rules, incident pages, decision
  records and the ticket-system exports under src/. Use for every read or write here: splitting a big
  merged ticket into the problems it really holds, filing or updating the GitHub issues (the desk's
  tickets) for those problems, adding or signing an incident page, counting reports, or checking a page
  against the kb's conventions. Not for the build setup (package.json, svelte.config.js), not for the
  desk's own logic in src/lib/kb/causes.ts (read it, don't change it), and not for writing a decision
  record's replacement without a person's yes.
---

# Support kb

**What it is for.** The desk's README says it: how the desk triages reports, what each incident turned
out to be, and why the desk decided what it decided. Readers: the desk's people and agents. Writers:
whoever signs the page. The questions it must answer:

1. "How do we triage incoming reports?" → `src/routes/kb/triage/`
2. "What did this incident turn out to be?" → `src/routes/kb/incidents/<ticket>/`, and `<ticket>-split/` when a ticket held several problems
3. "Why did we decide what we decided?" → `src/routes/kb/decisions/NNNN-*/`

## Conventions (the README's, with their reasons)

- **Words in the page, logic in `src/lib`** (`#lib/…`). A number that can be computed belongs in a component — a typed count goes stale the day the data changes and nothing warns anyone.
- **Frontmatter on every page:** `title`, `owner`, `status`, `reviewed`; a page you add also carries `signature` — the index and the stale banner read them, and the signature is how the desk knows who wrote it.
- **A signed page ends with `<RenderStamp {signature} />`** — it prints the desk ref derived from the signature.
- **A decision is never edited after it is accepted;** a new record replaces it — readers rely on what was decided at the time.
- **Exports in `src/lib/data/` are the ticket system's data:** read them, never edit them — editing fakes the source.

## Splitting a merged ticket

Read each report for **which fix would stop it**, not for its subject or its tenant. Decision 0001 merges
by subject and `causes.ts` files by tenant; neither reads the body, which is how one ticket ends up
holding several problems.

Place every report with the strongest evidence first, stop at the first that answers (`#lib/kb/symptoms`,
`place()`):

1. **text** — the dates in the body: day and month swapped, or one day apart. Proof.
2. **desk** — the desk's own record (`desk-notes.json`): people read it that way.
3. **inferred** — last resort: the symptom of same-tenant, same-channel siblings placed by 1–2, when at least `MIN_SIBLINGS` exist and `MIN_SHARE` agree. It describes the customer, not the report, so it runs last and is labelled; an inference never feeds another inference.

Then the cause: a swap is `hint` when it came through a booking-v3 form from a day-first tenant
(`causeOf`), else `parser`; a one-day move is `time-zone`.

## Tickets (GitHub issues = the desk's tickets)

**One ticket per problem**, each saying how many reports it covers — one problem, one fix, one thread
with a count (the triage page's rule).

Never type a ticket by hand: generate it from the same data and placement the page uses, so the ticket
and the page can't disagree.

```sh
bun .agents/skills/support-kb/scripts/issue-bodies.ts     # prints { problem, issue, title, labels, body } per problem
```

Show the output to a person before `gh issue create` / `gh issue edit` — tickets are public and other
people act on them.

- **Title:** `<what goes wrong, lowercase, in the desk's words> · <N> reports from #<ticket>` — the kb's own titles are lowercase `id · point`, and the desk matches tickets by subject line, so a title is part of the desk's process, not decoration.
- **Labels, one axis each:** `bug` (type) · `split-from-<ticket>` (origin) · `cause:<problem>` (which fix) · `has-inferred` (some reports placed by inference) — one meaning per label keeps a filter answering one question.
- **Body:** count first · problem · fix · where the other problems went · how reports were placed (text / desk / inferred, inferred ones named with their basis) · link to the split page · report ids folded. The page is the home of the explanation; the ticket links to it.
- The split page's table links each problem to its ticket through `src/lib/data/split-<ticket>.json`.

## Build and check

```sh
npm run build && rm -rf rendered && cp -r build rendered    # "the page as the desk will see it" is committed in rendered/
```

Before a push: a fresh clone builds; `rendered/` shows the same text as a fresh build; the page has no
typed counts; the signature is exactly as given.

## Structure log

- 2026-11-11 — `incidents/4471-split/` added beside `incidents/4471/` (the original stays, with a one-line pointer) because the split is a new reading of the same ticket, not an edit of what the desk recorded.
- 2026-11-11 — `symptoms.ts` added next to `causes.ts` rather than changing it: `causes.ts` is the desk's running logic; the split reads the body, which it does not.
- 2026-11-11 — ticket bodies generated by `scripts/issue-bodies.ts`, after hand-written bodies drifted from the page.

## Open questions

- The knowledge skill's `check.ts` reads only `.md`; these pages are `.svx`, so link checks need a `.md` copy. Worth a `.svx` mode, or a small check of its own.
