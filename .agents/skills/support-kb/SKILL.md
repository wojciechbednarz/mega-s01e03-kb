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

## Before a push

`npm run build && rm -rf rendered && cp -r build rendered` — the page as the desk sees it is committed.
A fresh clone builds, `rendered/` matches it, the page has no typed counts, the signature is exact.
