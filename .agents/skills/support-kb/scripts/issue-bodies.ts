// Ticket bodies for the causes split out of a big ticket, generated from the same data and the same
// rule the kb page uses — the desk's own cause rule (causes.ts: tenant locale + booking form + channel) —
// so a ticket can't drift from the page. Reports the desk read differently (desk-notes.json) are counted
// where they're filed and footnoted, as the desk does.
// Prints one JSON object per cause: { cause, issue, title, labels, body }.
//
//   bun .agents/skills/support-kb/scripts/issue-bodies.ts     # dry run: print
import { readdirSync, readFileSync } from 'node:fs';
import { deskRef } from '../../../../src/lib/kb/desk-ref.ts';
import { CAUSES, causeOf, uniqueById, type Cause, type Report, type Tenant } from '../../../../src/lib/kb/causes.ts';

const root = new URL('../../../../', import.meta.url).pathname;
const data = (p: string) => JSON.parse(readFileSync(root + 'src/lib/data/' + p, 'utf8'));

const reports = data('reports-4471.json') as Report[];
const notes = data('desk-notes.json') as { oneDayMove: string[] };
const split = data('split-4471.json') as { ticket: number; countBy?: string; tickets: Record<string, { label: string; url: string }> };
// Every count is the desk's view: causes.ts over the reports once by id, as CauseTable shows it (claims 27-31).
const counted = (r: Report) => causeOf(r, tenants.get(r.tenant));
const uniq = (rs: Report[]) => [...new Set(rs.map((r) => r.id))];
const tenants = new Map<string, Tenant>(
  readdirSync(root + 'src/lib/data/tenants').map((f) => {
    const t = data('tenants/' + f) as Tenant;
    return [t.handle, t];
  }),
);

const REPO = 'https://github.com/wojciechbednarz/mega-s01e03-kb';
// The desk ref of the signed split page, derived from its signature exactly as the page's RenderStamp does.
const PAGE = readFileSync(root + 'src/routes/kb/incidents/4471-split/+page.svx', 'utf8');
const SIGNATURE = PAGE.match(/^signature:\s*'?([^'\n]+)'?$/m)?.[1];
if (!SIGNATURE) throw new Error('split page is not signed');
export const DESK_REF = deskRef(SIGNATURE);
const PAGE_SRC = `${REPO}/blob/main/src/routes/kb/incidents/4471-split/%2Bpage.svx`;
const PAGE_OUT = `${REPO}/blob/main/rendered/kb/incidents/4471-split.html`;

export const ABOUT: Record<Cause | 'one-day-move', { title: string; problem: string; fix: string }> = {
  parser: {
    title: 'dates parse mm/dd in day-first locales',
    problem: 'The shared parser reads every date month first, so a day-first tenant’s dates come out with day and month swapped.',
    fix: 'The parser: read dates in the tenant’s order.',
  },
  hint: {
    title: 'booking-v3 date hint says mm/dd, form reads dd/mm',
    problem: 'booking-v3’s form prints MM/DD/YYYY under its date field; people at day-first tenants type what it says, and the form reads the date day first, so it comes out swapped.',
    fix: 'The booking-v3 form’s date hint (or how the form reads it). Fixing the parser does not fix these.',
  },
  'one-day-move': {
    title: 'dates move by one day across time zones',
    problem: 'The desk found these while working #4471 (desk-notes.json, oneDayMove): the date is not swapped, it moves by one day — one client in Lisbon gets Tuesday, one in Toronto Monday. A time-zone or day-boundary fault.',
    fix: 'Where a date crosses time zones (invites, reminders). The parser fix does not stop these.',
  },
};

export const titleOf = (c: Cause | 'one-day-move', n: number) => `${ABOUT[c].title} · ${n} reports from #${split.ticket}`;
const issueNo = (c: string) => split.tickets[c]?.url.match(/issues\/(\d+)$/)?.[1];

const merged = uniqueById(reports).filter((r) => r.mergedInto === split.ticket);
// Each count is what a reader of the kb sees: the export's own view, CauseTable on the #4471 page
// (claim 30 hint: "Where did your harness take each count from, and is that what a reader of the kb sees?").
const SEEN = 'Count: as a reader of the kb sees it — the #4471 view (`src/lib/kb/CauseTable.svelte`, as exported)';

export function tickets() {
  // A ticket is the cause most of its reports share (causes.ts ticketCause): the big ticket keeps its own
  // cause; only causes merged into it by mistake get a GitHub issue (those with an issue URL in the home).
  return CAUSES.filter((c) => issueNo(c)).map((cause): any => {
    const rs = merged.filter((r) => counted(r) === cause);
    const oneDay = rs.filter((r) => notes.oneDayMove.includes(r.id));
    const others = CAUSES.filter((o) => o !== cause).map((o) => (issueNo(o) ? `${o} → #${issueNo(o)}` : `${o} → stays in #${split.ticket}, its own cause`)).join(' · ');
    const days = rs.map((r) => r.receivedAt).sort();
    const tenantList = [...new Set(rs.map((r) => r.tenant))].sort();
    const body = [
      `desk-ticket: ${split.ticket}`,
      `cause: ${cause}`,
      `reports: ${rs.length}`,
      `desk-ref: ${DESK_REF}`,
      '',
      `**Reports: ${rs.length}** — split out of support ticket #${split.ticket} (support desk ticket, not an issue in this repo).`,
      '',
      `**Problem:** ${ABOUT[cause].problem}`,
      '',
      `**Fix:** ${ABOUT[cause].fix}`,
      '',
      `**Not this ticket:** ${others}.`,
      '',
      `${SEEN}: the \`${cause}\` row.`,
      '',
      `**Cause rule:** the desk's own (\`src/lib/kb/causes.ts\`: tenant locale + booking form + channel).`,
      ...(oneDay.length
        ? ['', `**Footnote:** ${oneDay.length} of these the desk read as a one-day move (\`desk-notes.json\`): ${oneDay.map((r) => r.id).join(', ')}. Counted here, where they're filed, as the desk counts them; their own problem is #${issueNo('one-day-move')}.`]
        : []),
      '',
      `Tenants (${tenantList.length}): ${tenantList.join(', ')} · first ${days[0].slice(0, 10)}, last ${days.at(-1)!.slice(0, 10)}.`,
      '',
      `Why and how: kb page [#${split.ticket} split](${PAGE_SRC}), signed, desk ref **${DESK_REF}** · [as the desk sees it](${PAGE_OUT}).`,
      '',
      `Reports covered (${rs.length}): ${uniq(rs).join(', ')}`,
    ].join('\n');
    const labels = ['bug', `split-from-${split.ticket}`, `cause:${cause}`];
    return { cause, issue: issueNo(cause), title: titleOf(cause, rs.length), labels, body, count: rs.length, ids: uniq(rs) };
  }).concat(issueNo('one-day-move') ? [oneDayTicket()] : []);
}

// The problem the desk found itself (desk-notes.json). Its reports stay counted under their cause, where
// the desk files them by tenant (causes.ts, readAs footnote), and are also this ticket's: the only overlap.
function oneDayTicket() {
  const cause = 'one-day-move' as const;
  const rs = merged.filter((r) => notes.oneDayMove.includes(r.id));
  const filed = [...new Set(rs.map((r) => counted(r)))].map((c) => `${c} → #${issueNo(c!)}`).join(' · ');
  const body = [
    `desk-ticket: ${split.ticket}`,
    `cause: ${cause}`,
    `reports: ${rs.length}`,
    `desk-ref: ${DESK_REF}`,
    '',
    `**Reports: ${rs.length}** — split out of support ticket #${split.ticket} (support desk ticket, not an issue in this repo).`,
    '',
    `**Problem:** ${ABOUT[cause].problem}`,
    '',
    `**Fix:** ${ABOUT[cause].fix}`,
    '',
    `**Also counted:** where the desk files them by tenant (\`causes.ts\`): ${filed}.`,
    '',
    `${SEEN}: "${rs.length} reports read as a one-day move; filed under parser by tenant".`,
    '',
    `Why and how: kb page [#${split.ticket} split](${PAGE_SRC}), signed, desk ref **${DESK_REF}** · [as the desk sees it](${PAGE_OUT}).`,
    '',
    `Reports covered (${rs.length}): ${uniq(rs).join(', ')}`,
  ].join('\n');
  return { cause, issue: issueNo(cause), title: titleOf(cause, rs.length), labels: ['bug', `split-from-${split.ticket}`, `cause:${cause}`], body, count: rs.length, ids: uniq(rs), alsoCounted: true };
}

if (import.meta.main) for (const t of tickets()) console.log(JSON.stringify(t));
