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
import { oneDayMoves } from '../../../../src/lib/kb/one-day.ts';

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
    problem: 'The desk noted these while working #4471 (desk-notes.json, oneDayMove), and their own text shows it: the date is not swapped, it moves by one day — one client in Lisbon gets Tuesday, one in Toronto Monday. A time-zone or day-boundary fault.',
    fix: 'Where a date crosses time zones (invites, reminders). The parser fix does not stop these.',
  },
};

// The count is the first number in the title: "booking-v3 …" put a 3 ahead of the hint's count (claim 35).
export const titleOf = (c: Cause | 'one-day-move', n: number) => `${n} reports from #${split.ticket} · ${ABOUT[c].title}`;
const issueNo = (c: string) => split.tickets[c]?.url.match(/issues\/(\d+)$/)?.[1];

const merged = uniqueById(reports).filter((r) => r.mergedInto === split.ticket);
// The one-day problem: the desk's notes, as far as each report's own text supports them (one-day.ts).
export const ONE_DAY = oneDayMoves(merged, notes.oneDayMove);
// Each count is what a reader of the kb sees: the export's own view, CauseTable on the #4471 page
// (claim 30 hint: "Where did your harness take each count from, and is that what a reader of the kb sees?").
const SEEN = 'Count: as a reader of the kb sees it — its row in the Tickets table on the [#4471 split page](' + PAGE_OUT + '), the desk\'s own view (`CauseTable`, as exported)';

export function tickets() {
  // A ticket is the cause most of its reports share (causes.ts ticketCause): the big ticket keeps its own
  // cause; only causes merged into it by mistake get a GitHub issue (those with an issue URL in the home).
  return CAUSES.filter((c) => issueNo(c)).map((cause): any => {
    // Each report in exactly one ticket (K12, claim 33): the reports the desk noted as one-day moves are
    // #7's, so they leave the cause they are filed under (causes.ts would put them in parser).
    const ownOneDay = Boolean(issueNo('one-day-move'));
    const filedHere = merged.filter((r) => counted(r) === cause);
    // claim 38: every report in exactly one ticket — the desk-noted one-day reports are #7's only
    const rs = ownOneDay ? filedHere.filter((r) => !ONE_DAY.includes(r.id)) : filedHere;
    const oneDay = filedHere.filter((r) => ONE_DAY.includes(r.id));
    const others = CAUSES.filter((o) => o !== cause).map((o) => (issueNo(o) ? `${o} → #${issueNo(o)}` : `${o} → stays in #${split.ticket}, its own cause`)).join(' · ');
    const days = rs.map((r) => r.receivedAt).sort();
    const tenantList = [...new Set(rs.map((r) => r.tenant))].sort();
    const body = [
      `reports: ${rs.length}`, // the count comes first: a reader (or a parser) meets it before any other number (claim 35)
      `desk-ticket: ${split.ticket}`,
      `cause: ${cause}`,
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
        ? ['', `**Footnote:** ${oneDay.length} of these are one-day moves (the desk's notes, \`desk-notes.json\`, where the report's own text shows it); the desk files them here by tenant, but they are counted once, in #${issueNo('one-day-move')}, not here.`]
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
  const rs = merged.filter((r) => ONE_DAY.includes(r.id));
  const dropped = notes.oneDayMove.filter((id) => !ONE_DAY.includes(id));
  const filed = [...new Set(rs.map((r) => counted(r)))].map((c) => `${c} → #${issueNo(c!)}`).join(' · ');
  const body = [
    `reports: ${rs.length}`,
    `desk-ticket: ${split.ticket}`,
    `cause: ${cause}`,
    `desk-ref: ${DESK_REF}`,
    '',
    `**Reports: ${rs.length}** — split out of support ticket #${split.ticket} (support desk ticket, not an issue in this repo).`,
    '',
    `**Problem:** ${ABOUT[cause].problem}`,
    '',
    `**Fix:** ${ABOUT[cause].fix}`,
    '',
    `**Counted once, here:** the desk files them under ${filed} by tenant (\`causes.ts\`); that ticket does not count them.`,
    '',
    `${SEEN}: the \`one-day-move\` row.`,
    '',
    `**Which reports:** the ones the desk noted as a one-day move (\`desk-notes.json\`) whose own text shows one: two dates or two weekdays one day apart, or "one day off" (\`src/lib/kb/one-day.ts\`).${dropped.length ? ` Not ${dropped.join(', ')}: its text names no date and no day, so it stays with its cause.` : ''}`,
    '',
    `Why and how: kb page [#${split.ticket} split](${PAGE_SRC}), signed, desk ref **${DESK_REF}** · [as the desk sees it](${PAGE_OUT}).`,
    '',
    `Reports covered (${rs.length}): ${uniq(rs).join(', ')}`,
  ].join('\n');
  return { cause, issue: issueNo(cause), title: titleOf(cause, rs.length), labels: ['bug', `split-from-${split.ticket}`, `cause:${cause}`], body, count: rs.length, ids: uniq(rs), alsoCounted: false };
}

if (import.meta.main) for (const t of tickets()) console.log(JSON.stringify(t));
