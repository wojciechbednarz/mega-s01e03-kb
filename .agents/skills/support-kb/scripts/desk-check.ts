// Desk check: read the repo the way the desk does, and fail where the desk could not match our tickets
// to the big ticket. It is our MODEL of the desk, not the desk: every refusal that this check did not
// predict is a fact about the desk that belongs here as a new rule (with the claim number that taught it).
//
//   bun .agents/skills/support-kb/scripts/desk-check.ts      # exits 1 on any ✗
//
// What it reads:
//   - the home for the causes: src/lib/data/split-4471.json (cause → ticket). Nothing else may name a cause.
//   - the kb as the desk sees it: rendered/**/*.html (text only)
//   - every GitHub issue created after this round started (the round = the page signature's iat)
//   - the ticket bodies the data generates (issue-bodies.ts)
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CAUSES } from '../../../../src/lib/kb/causes.ts';
import { DESK_REF, tickets } from './issue-bodies.ts';

const root = new URL('../../../../', import.meta.url).pathname;
const REPO = 'wojciechbednarz/mega-s01e03-kb';
const errors: string[] = [];
const ok = (m: string) => console.log('  ✓ ' + m);
const fail = (rule: string, m: string) => errors.push(`[${rule}] ${m}`);
const warns: string[] = [];
const warn = (rule: string, m: string) => warns.push(`[${rule}] ${m}`); // printed with "!", never fails the gate

const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const gh = (args: string[]) => {
  const r = spawnSync('gh', args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`gh ${args.join(' ')}: ${r.stderr}`);
  return JSON.parse(r.stdout);
};

// ── the home for the causes
const home = JSON.parse(readFileSync(join(root, 'src/lib/data/split-4471.json'), 'utf8')) as {
  ticket: number;
  tickets: Record<string, { url: string; state?: string }>;
};
const homeCauses = Object.keys(home.tickets);
const issueCauses = homeCauses.filter((c) => /issues\/\d+$/.test(home.tickets[c].url)); // the big ticket keeps its own cause
const issueOf = (c: string) => Number(home.tickets[c].url.match(/issues\/(\d+)$/)?.[1]);

// R1 · the home and the desk's code name the same causes
const codeOnly = CAUSES.filter((c) => !homeCauses.includes(c));
// a problem the desk noted itself (desk-notes.json) may have a ticket though causes.ts does not name it
const homeOnly = homeCauses.filter((c) => !(CAUSES as readonly string[]).includes(c) && !(home.tickets[c] as any).deskNoted);
if (codeOnly.length) fail('R1 home = code', `causes.ts has ${codeOnly.join(', ')} with no ticket in split-4471.json`);
if (homeOnly.length) fail('R1 home = code', `split-4471.json has ${homeOnly.join(', ')}, which causes.ts does not know`);
if (!codeOnly.length && !homeOnly.length) ok(`home names the code's causes: ${homeCauses.join(', ')}`);

// ── the round
const page = readFileSync(join(root, 'src/routes/kb/incidents/4471-split/+page.svx'), 'utf8');
const sig = page.match(/^signature:\s*'?([^'\n]+)'?$/m)?.[1] ?? '';
// The round starts when the run is started over on the Challenge page, NOT when start-challenge hands out a
// ticket: a repeat start-challenge re-issues the ticket inside the same round (claim 24, 2026-11-12: a new
// ticket, and the desk still read #1-#3). Record the "Start over" time in round-start.txt (ISO, UTC).
const roundFile = join(root, '.agents/skills/support-kb/round-start.txt');
let roundStart: Date;
try { roundStart = new Date(readFileSync(roundFile, 'utf8').trim()); } catch { roundStart = new Date(NaN); }
if (isNaN(roundStart.getTime())) { fail('R0 round', 'round-start.txt missing or not a date: write the time of the page\'s "Start over"'); roundStart = new Date(0); }

// ── tickets on GitHub created in this round
const issues = gh(['issue', 'list', '-R', REPO, '--state', 'all', '--limit', '200', '--json', 'number,title,body,state,stateReason,createdAt']) as {
  number: number; title: string; body: string; state: string; stateReason: string; createdAt: string;
}[];
const inRound = issues.filter((i) => new Date(i.createdAt) >= roundStart);
const old = issues.length - inRound.length;
ok(`${inRound.length} issues created after the round started (${roundStart.toISOString()})${old ? `, ${old} older ignored` : ''}`);

// R2 · every ticket the desk will read is a cause's ticket: no stubs, no extras
const homeIssues = new Set(issueCauses.map(issueOf));
for (const i of inRound)
  if (!homeIssues.has(i.number))
    fail('R2 no stray ticket', `#${i.number} (${i.state.toLowerCase()}) "${i.title}" is read by the desk but is no cause's ticket in split-4471.json`);
for (const c of issueCauses)
  if (!inRound.some((i) => i.number === issueOf(c))) fail('R2 no stray ticket', `cause ${c}: #${issueOf(c)} was not created in this round`);

// R3 · each ticket carries the tie to the big ticket and to the signed page, and its own count
const want = tickets();
for (const t of want) {
  const i = inRound.find((x) => String(x.number) === t.issue);
  if (!i) continue;
  const head = Object.fromEntries(i.body.split('\n').slice(0, 6).map((l) => l.split(/:\s*/, 2)).filter((p) => p.length === 2));
  if (head['desk-ticket'] !== String(home.ticket)) fail('R3 tie', `#${i.number}: no "desk-ticket: ${home.ticket}" line`);
  if (head['desk-ref'] !== DESK_REF) fail('R3 tie', `#${i.number}: desk-ref ${head['desk-ref'] ?? 'missing'} ≠ the page's ${DESK_REF}`);
  if (head['cause'] !== t.cause) fail('R3 tie', `#${i.number}: cause ${head['cause']} ≠ ${t.cause}`);
  if (head['reports'] !== String(t.count)) fail('R3 tie', `#${i.number}: reports ${head['reports']} ≠ ${t.count} computed`);
}
// R6 · every cause's ticket is open (claim 22, H1 in analysis-2026-11-12: the export's CauseTable prints
// "no ticket of its own" for hint, and a closed ticket may count as none)
for (const c of issueCauses) {
  const i = inRound.find((x) => x.number === issueOf(c));
  const wantState = (home.tickets[c] as any).state ?? 'OPEN'; // claim 36: the hint ends closed as not planned (MEGA support, by: human)
  if (i && i.state !== wantState) fail('R6 ticket state', `cause ${c}: #${i.number} is ${i.state.toLowerCase()} (${i.stateReason || 'no reason'})`);
}
// R4 · the tickets split the big ticket exactly: every report once
// the one allowed overlap: desk-noted reports, also counted under the cause they're filed in
const placed = want.filter((t: any) => !t.alsoCounted).flatMap((t) => t.ids);
const unique = new Set(placed);
const merged = JSON.parse(readFileSync(join(root, 'src/lib/data/reports-4471.json'), 'utf8')) as { id: string; mergedInto: number | null }[];
const all = new Set(merged.filter((r) => r.mergedInto === home.ticket).map((r) => r.id));
if (unique.size !== placed.length) fail('R4 exact split', `${placed.length - unique.size} reports sit in two tickets`);
const outside = [...unique].filter((id) => !all.has(id));
if (outside.length) fail('R4 exact split', `${outside.length} ticketed reports are not in #${home.ticket}`);
if (unique.size === placed.length && !outside.length) ok(`split out of #${home.ticket}: ${want.map((t) => `${t.cause} ${t.count}`).join(' + ')}; ${all.size - unique.size} stay in #${home.ticket} (its own cause: ${homeCauses.filter((c) => !issueCauses.includes(c)).join(', ')})`);

// R7 · coverage: every report of the big ticket is in some ticket. Reports may stay in the big ticket only
// when the home keeps a cause there (a cause in split-4471.json with no issue URL). R4 checks no overlap
// and nothing from outside; this checks nothing is left behind by accident.
const keptCauses = homeCauses.filter((c) => !issueCauses.includes(c));
const unplaced = [...all].filter((id) => !unique.has(id));
if (unplaced.length && !keptCauses.length)
  fail('R7 coverage', `${unplaced.length} reports of #${home.ticket} are in no ticket and no cause stays there: ${unplaced.slice(0, 10).join(', ')}${unplaced.length > 10 ? ', …' : ''}`);
else ok(`coverage: ${unique.size} of ${all.size} reports in a ticket${unplaced.length ? `, ${unplaced.length} kept in #${home.ticket} by ${keptCauses.join(', ')}` : ''}`);

// R5 · the kb, as the desk sees it, names no cause without a ticket (claim 20's hint: "Which cause on
// the kb has no ticket yet?"). Phrases are our model of "names a cause"; add one when a refusal teaches it.
const UNTICKETED = [
  /not a ticket yet/i, /no ticket (yet|of its own)/i, /cause of (its|their) own/i, /gets its own ticket/i,
  /\bno cause\b/i, /\bunplaced\b/i, /has no ticket/i,
];
// Text as a reader sees it: scripts, styles and tags out first, then CauseTable's own fixed words (the
// desk's view) removed. (Until 2026-11-12 a `//` comment sat inside this chain and swallowed the script,
// style and tag stripping, so R5 matched raw HTML.)
const text = (f: string) =>
  readFileSync(f, 'utf8')
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/not this ticket — no ticket of its own/g, '');
let hits = 0;
// The desk's own pages, as exported, are its view: they are not ours to reword (claim 27: "The desk counts
// with its own view, as it was exported."), so R5 reads only the pages we added or changed.
const asExported = (f: string) => {
  const src = f.replace(join(root, 'rendered'), 'src/routes').replace(/\.html$/, '/+page.svx').replace('src/routes/kb/+page.svx', 'src/routes/kb/+page.svx');
  const r = spawnSync('git', ['diff', '--quiet', '91120d4', '--', src.replace('src/routes/kb.html', 'src/routes/kb/+page.svx')], { cwd: root });
  return r.status === 0 && spawnSync('git', ['cat-file', '-e', `91120d4:${src}`], { cwd: root }).status === 0;
};
for (const f of walk(join(root, 'rendered')).filter((f) => f.endsWith('.html') && !asExported(f))) {
  const t = text(f);
  for (const re of UNTICKETED) {
    const m = t.match(re);
    if (!m) continue;
    hits++;
    const at = m.index ?? 0;
    fail('R5 kb names no unticketed cause', `${f.replace(root, '')}: "…${t.slice(Math.max(0, at - 70), at + m[0].length + 30).trim()}…"`);
  }
}
if (!hits) ok('rendered kb names no cause without a ticket');

// R8 · numbers a reader sees on our pages agree with the tickets. WARNING only (does not fail the gate):
// whether "2 causes" plus a desk-noted problem reads as 3 problems is a judgment, not yet a refusal fact.
// Promote a line to fail() when a refusal teaches it.
const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
let r8 = 0;
for (const f of walk(join(root, 'rendered')).filter((f) => f.endsWith('.html') && !asExported(f))) {
  const t = text(f), rel = f.replace(root, '');
  for (const m of t.matchAll(/\b(one|two|three|four|five|\d+) (causes|problems)\b/gi)) {
    const n = WORDS[m[1].toLowerCase()] ?? Number(m[1]);
    if (n !== want.length) { r8++; warn('R8 reader numbers', `${rel}: says "${m[0]}" but ${want.length} tickets split #${home.ticket}`); }
  }
  for (const tk of want) {
    // the first number after "issue #N"; "×45" is a symptom tally (ReportedMost), not a count
    const near = new RegExp(`issue #${tk.issue}\\b[^#\\d×]{0,60}(×?)(\\d+)\\b`, 'g');
    for (const m of t.matchAll(near))
      if (!m[1] && Number(m[2]) !== tk.count && !/^20\d\d$/.test(m[2])) { r8++; warn('R8 reader numbers', `${rel}: "${m[0].trim()}" shows ${m[2]} next to #${tk.issue}, its ticket says ${tk.count}`); }
  }
}
if (!r8) ok('numbers on our pages agree with the tickets');

for (const w of warns) console.log('  ! ' + w);
for (const e of errors) console.log('  ✗ ' + e);
console.log(errors.length ? `\ndesk-check: ${errors.length} error(s)` : '\ndesk-check: clean');
process.exit(errors.length ? 1 : 0);
