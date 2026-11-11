// Ticket bodies for the problems split out of a big ticket, generated from the same data and the
// same placement the kb page uses (#lib/kb/symptoms, #lib/kb/causes), so a ticket can't drift
// from the page. Prints one JSON object per problem: { problem, issue, title, labels, body }.
//
//   bun scripts/issue-bodies.ts            # dry run: print
//
// The page is the home of the explanation; a ticket says what's broken, how many, which fix.
import { readdirSync, readFileSync } from 'node:fs';
import { causeOf, uniqueById, type Report, type Tenant } from '../src/lib/kb/causes.ts';
import { place, type Placed } from '../src/lib/kb/symptoms.ts';

const root = new URL('..', import.meta.url).pathname;
const data = (p: string) => JSON.parse(readFileSync(root + 'src/lib/data/' + p, 'utf8'));

const reports = data('reports-4471.json') as Report[];
const notes = data('desk-notes.json') as { oneDayMove: string[] };
const split = data('split-4471.json') as { ticket: number; tickets: Record<string, { label: string; url: string }> };
const tenants = new Map<string, Tenant>(
  readdirSync(root + 'src/lib/data/tenants').map((f) => {
    const t = data('tenants/' + f) as Tenant;
    return [t.handle, t];
  }),
);

const REPO = 'https://github.com/wojciechbednarz/mega-s01e03-kb';
const PAGE_SRC = `${REPO}/blob/main/src/routes/kb/incidents/4471-split/%2Bpage.svx`;
const PAGE_OUT = `${REPO}/blob/main/rendered/kb/incidents/4471-split.html`;

type Problem = 'parser' | 'hint' | 'time-zone';
const ABOUT: Record<Problem, { title: string; problem: string; fix: string }> = {
  parser: {
    title: 'parser reads day-first dates month first',
    problem: 'The shared parser reads every date month first, so a day-first tenant’s dates come out with day and month swapped.',
    fix: 'The parser: read dates in the tenant’s order.',
  },
  hint: {
    title: 'booking-v3 date hint says MM/DD, form reads DD/MM',
    problem: 'booking-v3’s form prints MM/DD/YYYY under its date field; people at day-first tenants type what it says, and the form reads the date day first, so it comes out swapped.',
    fix: 'The booking-v3 form’s date hint (or how the form reads it). Fixing the parser does not fix these.',
  },
  'time-zone': {
    title: 'booking date moves by one day (time zone / DST)',
    problem: 'The date moves by one day; it is not swapped. A time-zone or daylight-saving error moves a date by hours, at most a day.',
    fix: 'Time-zone and daylight-saving handling. Neither the parser fix nor the hint fix stops these.',
  },
};

const merged = uniqueById(reports).filter((r) => r.mergedInto === split.ticket);
const placed = place(merged, notes.oneDayMove);

function problemOf(r: Report, p: Placed): Problem | null {
  if (p.symptom === 'one-day') return 'time-zone';
  if (p.symptom === 'swap') return causeOf(r, tenants.get(r.tenant));
  return null;
}

const ORDER: Problem[] = ['parser', 'hint', 'time-zone'];
const issueNo = (p: Problem) => split.tickets[p]?.url.match(/issues\/(\d+)$/)?.[1];

for (const problem of ORDER) {
  const rs = merged.filter((r) => problemOf(r, placed.get(r.id)!) === problem);
  const by = (e: Placed['evidence']) => rs.filter((r) => placed.get(r.id)!.evidence === e);
  const inferred = by('inferred');
  const others = ORDER.filter((o) => o !== problem).map((o) => `${o} → #${issueNo(o)}`).join(' · ');
  const first = rs.map((r) => r.receivedAt).sort()[0].slice(0, 10);
  const last = rs.map((r) => r.receivedAt).sort().at(-1)!.slice(0, 10);
  const tenantList = [...new Set(rs.map((r) => r.tenant))].sort();

  const body = [
    `**Reports: ${rs.length}** — split out of support ticket #${split.ticket}.`,
    '',
    `**Problem:** ${ABOUT[problem].problem}`,
    '',
    `**Fix:** ${ABOUT[problem].fix}`,
    '',
    `**Not this ticket:** ${others}.`,
    '',
    '| placed by | reports |',
    '|---|---|',
    `| the report's text | ${by('text').length} |`,
    `| the desk's note (\`desk-notes.json\`) | ${by('desk').length} |`,
    `| inferred from same-tenant, same-channel reports | ${inferred.length} |`,
    ...(inferred.length
      ? ['', 'Inferred, not read from the report:', ...inferred.map((r) => `- ${r.id}: ${placed.get(r.id)!.basis}`)]
      : []),
    '',
    `Tenants (${tenantList.length}): ${tenantList.join(', ')} · first ${first}, last ${last}.`,
    '',
    `Why and how: kb page [#${split.ticket} split](${PAGE_SRC}) · [as the desk sees it](${PAGE_OUT}).`,
    '',
    `<details><summary>Report ids (${rs.length})</summary>`,
    '',
    rs.map((r) => r.id).join(', '),
    '',
    '</details>',
  ].join('\n');

  const labels = ['bug', `split-from-${split.ticket}`, `cause:${problem}`, ...(inferred.length ? ['has-inferred'] : [])];
  const title = `${ABOUT[problem].title} · ${rs.length} reports from #${split.ticket}`;
  console.log(JSON.stringify({ problem, issue: issueNo(problem), title, labels, body }));
}
