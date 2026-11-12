// Sanitize: is the whole kb consistent — pages, data, tickets, rendered output? Errors exit 1.
// Run before every push and before every claim (the pre-claim gate).
//
//   bun .agents/skills/support-kb/scripts/sanitize.ts            # repo + GitHub tickets
//   bun .agents/skills/support-kb/scripts/sanitize.ts --build    # + fresh build vs rendered/
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tickets } from './issue-bodies.ts';

const root = new URL('../../../../', import.meta.url).pathname;
const REPO = 'wojciechbednarz/mega-s01e03-kb';
const EXPORT = '91120d4'; // the export as received: never edited after it
const errors: string[] = [];
const warns: string[] = [];
const ok = (m: string) => console.log('  ✓ ' + m);

const sh = (cmd: string, args: string[]) => {
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
};
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const front = (s: string) => Object.fromEntries(
  (s.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '').split('\n').map((l) => l.split(/:\s(.*)/s)).filter((p) => p.length > 1).map(([k, v]) => [k, v.replace(/^'|'$/g, '')]),
);

// 1. Pages: frontmatter, signatures, links, typed counts
const pages = walk(join(root, 'src/routes')).filter((f) => f.endsWith('+page.svx'));
const original = new Set(sh('git', ['ls-tree', '-r', '--name-only', EXPORT]).split('\n'));
const routes = new Set(pages.map((p) => p.replace(join(root, 'src/routes'), '').replace('/+page.svx', '')));
const sigs = new Set<string>();
for (const p of pages) {
  const rel = p.replace(root, '');
  const s = readFileSync(p, 'utf8');
  const fm = front(s);
  for (const k of ['title', 'owner', 'status', 'reviewed']) if (!fm[k]) errors.push(`${rel}: frontmatter has no ${k}`);
  if (!original.has(rel)) {
    if (!fm.signature) errors.push(`${rel}: an added page must be signed (README)`);
    else sigs.add(fm.signature);
    if (!s.trimEnd().endsWith('<RenderStamp {signature} />')) errors.push(`${rel}: an added page must end with <RenderStamp {signature} />`);
  }
  for (const [, href] of s.matchAll(/\]\((\/kb[^)#\s]*)\)/g)) if (!routes.has(href)) errors.push(`${rel}: link to missing page ${href}`);
  const body = s.replace(/^---[\s\S]*?---/, '').replace(/<script[\s\S]*?<\/script>/, '').replace(/`[^`]*`/g, '');
  for (const m of body.matchAll(/(?<![#\w-])\b\d{2,}\b(?!\s*(January|February|March|April|May|June|July|August|September|October|November|December))/g)) {
    const around = body.slice(Math.max(0, m.index! - 12), m.index! + 12);
    if (!/\d{4}-\d\d|R-\d|\d{4}\b(?! reports)/.test(around)) warns.push(`${rel}: typed number "${m[0]}" — computable counts belong in a component`);
  }
}
if (sigs.size > 1) errors.push(`signed pages carry ${sigs.size} different signatures`);
ok(`${pages.length} pages checked (frontmatter, signature, links, typed counts)`);

// 2. The export and accepted decisions are never edited
const changed = sh('git', ['diff', '--name-only', EXPORT, '--', 'src/lib/data/reports-4471.json', 'src/lib/data/desk-notes.json', 'src/lib/data/tenants', 'src/routes/kb/decisions/0001-dedupe-by-subject', 'src/lib/kb/causes.ts']).trim();
if (changed) errors.push(`edited what must not be edited: ${changed.split('\n').join(', ')}`);
else ok('export data, causes.ts and decision 0001 unchanged since the export');

// 3. Tickets on GitHub == tickets the data generates
const want = tickets();
const total = want.reduce((n, t) => n + t.count, 0);
const ids = new Set(want.flatMap((t) => t.ids));
if (ids.size !== total) errors.push(`a report is in more than one ticket (${total} placements, ${ids.size} reports)`);
const issues = JSON.parse(sh('gh', ['issue', 'list', '-R', REPO, '--state', 'all', '--limit', '100', '--json', 'number,title,body,state,stateReason,labels']));
const split = JSON.parse(readFileSync(join(root, 'src/lib/data/split-4471.json'), 'utf8'));
for (const t of want) {
  const i = issues.find((x: any) => String(x.number) === t.issue);
  if (!i) { errors.push(`cause ${t.cause}: no GitHub issue #${t.issue}`); continue; }
  const want = (split.tickets as any)[t.cause] ?? {};
  const wantState = want.state ?? 'OPEN';
  if (i.state !== wantState) errors.push(`#${t.issue} (${t.cause}) is ${i.state}, split-4471.json expects ${wantState}`);
  if (want.stateReason && i.stateReason !== want.stateReason) errors.push(`#${t.issue} closed as ${i.stateReason}, expected ${want.stateReason}`);
  if (i.title !== t.title) errors.push(`#${t.issue} title differs from the generated one`);
  if (i.body.trim() !== t.body.trim()) errors.push(`#${t.issue} body differs from the generated one (run issue-bodies.ts, then gh issue edit)`);
  const have = i.labels.map((l: any) => l.name).sort().join(',');
  if (have !== [...t.labels].sort().join(',')) errors.push(`#${t.issue} labels ${have} ≠ ${t.labels.join(',')}`);
}
const linked = new Set(want.map((t) => t.issue));
for (const i of issues) {
  const split = i.labels.some((l: any) => l.name.startsWith('split-from-'));
  if (i.state === 'OPEN' && split && !linked.has(String(i.number))) errors.push(`#${i.number} is open and split-labelled but no cause maps to it`);
}
ok(`${want.length} tickets compared with GitHub · ${total} reports placed`);

// 4. The local desk: our model of how the desk matches tickets to #4471 (desk-check.ts)
{
  const r = spawnSync('bun', [join(root, '.agents/skills/support-kb/scripts/desk-check.ts')], { cwd: root, encoding: 'utf8' });
  for (const l of r.stdout.split('\n').filter((l) => l.includes('✗'))) errors.push('desk-check ' + l.trim().replace(/^✗ /, ''));
  if (r.status === 0) ok('desk-check clean');
}

// 5. Rendered output is a fresh build
if (process.argv.includes('--build')) {
  sh('npm', ['run', 'build']);
  const text = (f: string) => readFileSync(f, 'utf8').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<link[^>]*>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  for (const f of walk(join(root, 'build')).filter((f) => f.endsWith('.html'))) {
    const r = f.replace('/build/', '/rendered/');
    if (!existsSync(r)) errors.push(`rendered/ is missing ${r.replace(root, '')}`);
    else if (text(f) !== text(r)) errors.push(`${r.replace(root, '')} differs from a fresh build (copy build/ to rendered/)`);
  }
  ok('fresh build compared with rendered/');
}

for (const w of warns) console.log('  ! ' + w);
for (const e of errors) console.log('  ✗ ' + e);
console.log(errors.length ? `\n${errors.length} error(s)` : '\nclean');
process.exit(errors.length ? 1 : 0);
