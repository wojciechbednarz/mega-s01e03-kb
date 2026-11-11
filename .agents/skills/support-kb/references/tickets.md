# Tickets (GitHub issues = the desk's tickets)

One ticket per **cause** — the desk's cause (`causeOf`) — each with how many reports it covers: one cause, one fix, one thread with a count. A symptom the desk has no cause for is a task until confirmed.

**Generate, never type:** `bun .agents/skills/support-kb/scripts/issue-bodies.ts` prints title, labels and
body per problem from the same data and placement the page uses, so ticket and page can't disagree.
Show it to a person before `gh issue create` / `gh issue edit`: tickets are public.

- **Title:** `<what goes wrong, lowercase, in the desk's words> · <N> reports from #<ticket>` — the kb's titles are lowercase `id · point`, and the desk matches by subject line.
- **Labels, one axis each:** `bug` · `split-from-<ticket>` · `cause:<cause>` — one meaning per label, one question per filter.
- **Body:** count first · problem · fix · where the other causes went · the cause rule · desk-noted reports footnoted · link to the split page · the covered report ids on one plain line (`mergedInto` in the export). The page is the home of the explanation.
- The split page links each problem to its ticket through `src/lib/data/split-<ticket>.json`.
