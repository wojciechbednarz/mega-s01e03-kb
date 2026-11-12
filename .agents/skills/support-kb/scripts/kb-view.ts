// kb-view: what the kb SHOWS a reader, as numbers with their provenance.
//
//   bun .agents/skills/support-kb/scripts/kb-view.ts --out views.json
//
// 1. builds the kb exactly as exported (commit 91120d4) in a throw-away git worktree, then removes it
// 2. takes the current build from rendered/
// 3. extracts every number a reader sees from both builds' HTML (text, tables, SVG <text>, aria-label/alt/title,
//    SVG bar heights), each with route, enclosing structure, table header/row label, sentence, component
// 4. re-computes the #4471 numbers from the data with causes.ts and marks each recomputed: true | false | "n/a"
// 5. diffs the two builds by (route, context) and lists pages present in one build only
//
// The HTML is read with a small tolerant parser below (Svelte/SvelteKit output is well formed), not with
// HTMLRewriter: a tree lets us ask "which table cell, which row, which header" after the fact.
// Reads no .env file. Never writes src/, rendered/, git history or GitHub (the worktree lives in the scratchpad).
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const REPO = resolve(import.meta.dir, '../../../..');
const EXPORT_COMMIT = '91120d4';
const WORKTREE =
  process.env.KBVIEW_WORKTREE ??
  '/home/wojslaw/.cache/claude-code/tmp/claude-1000/-home-wojslaw-repos-learning-helper-claude-proj/b985824e-10a1-4d96-b504-d3e456cf1918/scratchpad/kbview-exported';
const BUILD_FILES = ['package.json', 'package-lock.json', 'svelte.config.js', 'vite.config.js', 'src/app.html', 'src/routes/+layout.ts'];
const TICKET = 4471;

// ───────────────────────────────────────────────────────────── tiny HTML tree

type El = { type: 'el'; tag: string; attrs: Record<string, string>; children: Node[]; parent: El | null; comp?: string; compBasis?: string };
type Txt = { type: 'text'; text: string; parent: El };
type Node = El | Txt;

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const INLINE = new Set(['a', 'b', 'strong', 'em', 'i', 'u', 'code', 'span', 'small', 'sup', 'sub', 'mark', 'abbr', 'kbd', 's', 'del', 'ins', 'tspan', 'time', 'q', 'cite', 'var', 'samp']);
const SKIP = new Set(['script', 'style', 'template', 'noscript']);

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', times: '×', rarr: '→', middot: '·', mdash: '—', ndash: '–', hellip: '…' };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
    }
    return ENT[e.toLowerCase()] ?? m;
  });

function parseHtml(src: string): El {
  const root: El = { type: 'el', tag: '#root', attrs: {}, children: [], parent: null };
  let cur = root;
  let i = 0;
  const n = src.length;
  const lower = src.toLowerCase();
  while (i < n) {
    if (src[i] !== '<') {
      const j = src.indexOf('<', i);
      const end = j < 0 ? n : j;
      cur.children.push({ type: 'text', text: decode(src.slice(i, end)), parent: cur });
      i = end;
      continue;
    }
    if (src.startsWith('<!--', i)) {
      const j = src.indexOf('-->', i + 4);
      i = j < 0 ? n : j + 3;
      continue;
    }
    if (src[i + 1] === '!' || src[i + 1] === '?') {
      const j = src.indexOf('>', i);
      i = j < 0 ? n : j + 1;
      continue;
    }
    if (src[i + 1] === '/') {
      const m = /^<\/([a-zA-Z][^\s>]*)\s*>/.exec(src.slice(i, i + 80));
      if (!m) { i++; continue; }
      const name = m[1].toLowerCase();
      let e: El | null = cur;
      while (e && e.tag !== name) e = e.parent;
      if (e && e.parent) cur = e.parent; // else: stray end tag, ignored
      i += m[0].length;
      continue;
    }
    const nm = /^<([a-zA-Z][^\s/>]*)/.exec(src.slice(i, i + 80));
    if (!nm) {
      cur.children.push({ type: 'text', text: '<', parent: cur });
      i++;
      continue;
    }
    const tag = nm[1].toLowerCase();
    i += nm[0].length;
    const attrs: Record<string, string> = {};
    let selfClose = false;
    for (;;) {
      while (i < n && /\s/.test(src[i])) i++;
      if (i >= n) break;
      if (src[i] === '>') { i++; break; }
      if (src.startsWith('/>', i)) { selfClose = true; i += 2; break; }
      const am = /^([^\s"'<>/=]+)/.exec(src.slice(i, i + 200));
      if (!am) { i++; continue; }
      i += am[0].length;
      let val = '';
      let k = i;
      while (k < n && /\s/.test(src[k])) k++;
      if (src[k] === '=') {
        k++;
        while (k < n && /\s/.test(src[k])) k++;
        if (src[k] === '"' || src[k] === "'") {
          const q = src[k];
          const e = src.indexOf(q, k + 1);
          val = src.slice(k + 1, e < 0 ? n : e);
          i = e < 0 ? n : e + 1;
        } else {
          const vm = /^[^\s>]+/.exec(src.slice(k, k + 500));
          val = vm ? vm[0] : '';
          i = k + val.length;
        }
      }
      attrs[am[1]] = decode(val);
    }
    const el: El = { type: 'el', tag, attrs, children: [], parent: cur };
    cur.children.push(el);
    if (tag === 'script' || tag === 'style') {
      const e = lower.indexOf(`</${tag}`, i);
      const end = e < 0 ? n : e;
      el.children.push({ type: 'text', text: src.slice(i, end), parent: el });
      const gt = src.indexOf('>', end);
      i = gt < 0 ? n : gt + 1;
      continue;
    }
    if (!VOID.has(tag) && !selfClose) cur = el;
  }
  return root;
}

const kids = (e: El) => e.children.filter((c): c is El => c.type === 'el');
const classesOf = (e: El) => (e.attrs.class ?? '').split(/\s+/).filter((c) => c && !c.startsWith('svelte-'));
function find(e: El, pred: (x: El) => boolean): El | null {
  if (pred(e)) return e;
  for (const c of kids(e)) { const r = find(c, pred); if (r) return r; }
  return null;
}

// Visible text of a subtree, whitespace collapsed; remembers where each text node starts (for sentences).
type Flat = { text: string; at: Map<Txt, { base: number; text: string }> };
const flatCache = new WeakMap<El, Flat>();
function flatten(el: El): Flat {
  const hit = flatCache.get(el);
  if (hit) return hit;
  let out = '';
  const at = new Map<Txt, { base: number; text: string }>();
  const sep = () => { if (out && !out.endsWith(' ')) out += ' '; };
  const walk = (e: El) => {
    for (const c of e.children) {
      if (c.type === 'text') {
        let t = c.text.replace(/\s+/g, ' ');
        if (out.endsWith(' ') && t.startsWith(' ')) t = t.slice(1);
        at.set(c, { base: out.length, text: t });
        out += t;
      } else if (!SKIP.has(c.tag)) {
        const block = !INLINE.has(c.tag);
        if (block) sep();
        walk(c);
        if (block) sep();
      }
    }
  };
  walk(el);
  const f = { text: out, at };
  flatCache.set(el, f);
  return f;
}
const textOf = (el: El) => flatten(el).text.trim();

// ───────────────────────────────────────────────────────────── numbers

type Num = {
  build: 'exported' | 'current';
  route: string;
  raw: string; // the token as printed: 412, 2026-04-01, 03-30
  value: string; // digits of the first run
  kind: 'text' | 'svg-text' | 'title' | 'bar-height' | `attr:${string}`;
  embedded: boolean; // glued to a letter: booking-v3, DR-3F2A
  compound: boolean; // date/time/range token with separators
  structure: string;
  tableHeader: string | null; // the header cell above it (tables)
  rowLabel: string | null; // the row's first cell (tables)
  table: string | null; // the table's header row, joined
  sentence: string;
  component: string;
  componentBasis: string;
  key: string; // diff key, route-independent
  recomputed: boolean | 'n/a';
  expression?: string;
  expected?: string;
  note?: string;
  // internal, stripped before writing
  _owner?: El;
  _block?: El;
  _before?: string;
  _after?: string;
  _ord?: number;
  _barClass?: string;
  _barIndex?: number;
};

const NUM_RE = /\d+(?:[.,:/-]\d+)*/g;
const MASK_ASSET = /[\w./-]*_app\/immutable[\w./-]*|[\w-]+\.[A-Za-z0-9_-]{8}\.(?:js|css|mjs)\b/g;
// #2f6f5e / #fff are colours, not numbers; #4471 and #6 (digits only) are ticket numbers and stay
const isColour = (prev: string, raw: string, tail: string) => prev === '#' && /^[0-9a-f]{3,8}$/i.test(raw + tail) && /[a-f]/i.test(raw + tail);

function sentenceAt(text: string, pos: number): string {
  const re = /[.!?](?=\s)/g;
  let s = 0;
  let e = text.length;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index < pos) s = m.index + 1;
    else { e = m.index + 1; break; }
  }
  s += text.slice(s, e).length - text.slice(s, e).trimStart().length;
  let out = text.slice(s, e).trim();
  if (out.length > 160) {
    const p = pos - s;
    let a = Math.max(0, p - 75);
    const b = Math.min(out.length, a + 156);
    a = Math.max(0, b - 156);
    out = (a > 0 ? '…' : '') + out.slice(a, b) + (b < out.length ? '…' : '');
  }
  return out;
}

const blockOf = (e: El): El => { let x = e; while (INLINE.has(x.tag) && x.parent && x.parent.tag !== '#root') x = x.parent; return x; };

function structureOf(e: El, attr?: string): string {
  const segs: string[] = [];
  let x: El | null = e;
  while (x && x.tag !== '#root') {
    const same = x.parent ? kids(x.parent).filter((s) => s.tag === x!.tag) : [];
    const cls = classesOf(x).filter((c) => !['wrong', 'stale', 'dup'].includes(c));
    segs.unshift(x.tag + (cls.length ? '.' + cls[0] : '') + (same.length > 1 ? `[${same.indexOf(x) + 1}]` : ''));
    if (x.tag === 'main' || x.tag === 'body') break;
    x = x.parent;
  }
  return segs.join(' > ') + (attr ? ` @${attr}` : '');
}

type Cell = { header: string | null; rowLabel: string; headers: string[] };
function cellOf(e: El): Cell | null {
  let x: El | null = e;
  while (x && x.tag !== 'td' && x.tag !== 'th') { if (x.tag === 'table') return null; x = x.parent; }
  if (!x || !x.parent || x.parent.tag !== 'tr') return null;
  const row = x.parent;
  let t: El | null = row;
  while (t && t.tag !== 'table') t = t.parent;
  if (!t) return null;
  const cells = kids(row).filter((c) => c.tag === 'td' || c.tag === 'th');
  const col = cells.indexOf(x);
  const hdrRow = find(t, (y) => y.tag === 'tr' && kids(y).some((c) => c.tag === 'th'));
  const headers = hdrRow ? kids(hdrRow).filter((c) => c.tag === 'th').map(textOf) : [];
  return { header: x.tag === 'td' ? headers[col] ?? null : null, rowLabel: cells[0] ? textOf(cells[0]) : '', headers };
}

function extractNumbers(root: El, route: string, build: Num['build']): Num[] {
  const nums: Num[] = [];
  const ordinals = new Map<El, number>();
  const barCount: Record<string, number> = {};

  // `text` is the string the numbers are found in; `flat`/`base` locate it inside its block's full text
  const push = (owner: El, kind: Num['kind'], text: string, block: El, flat: string, base: number, attr?: string) => {
    const masked = text.replace(MASK_ASSET, (m) => ' '.repeat(m.length));
    for (const m of masked.matchAll(NUM_RE)) {
      const raw = m[0];
      const at = m.index!;
      const prev = text[at - 1] ?? '';
      const next = text[at + raw.length] ?? '';
      if (isColour(prev, raw, /^[0-9a-f]*/i.exec(text.slice(at + raw.length))?.[0] ?? '')) continue;
      const cell = attr ? null : cellOf(owner);
      const pos = base + at;
      const ord = ordinals.get(block) ?? 0;
      ordinals.set(block, ord + 1);
      nums.push({
        build, route, raw, value: /\d+/.exec(raw)![0], kind,
        embedded: /\p{L}/u.test(prev) || /\p{L}/u.test(next),
        compound: !/^\d+$/.test(raw),
        structure: structureOf(owner, attr),
        tableHeader: cell?.header ?? null,
        rowLabel: cell ? cell.rowLabel : null,
        table: cell ? cell.headers.join(' | ') : null,
        sentence: sentenceAt(flat, pos),
        component: 'unknown', componentBasis: '', key: '', recomputed: 'n/a',
        _owner: owner, _block: block,
        _before: flat.slice(Math.max(0, pos - 30), pos), _after: flat.slice(pos + raw.length, pos + raw.length + 40), _ord: ord,
      });
    }
  };

  const visit = (el: El) => {
    if (SKIP.has(el.tag)) return;
    if (el.tag === 'head') { // only the tab title is something a reader sees
      const t = find(el, (x) => x.tag === 'title');
      if (t) push(t, 'title', textOf(t), t, textOf(t), 0);
      return;
    }
    if (el.attrs.hidden !== undefined || /display\s*:\s*none/.test(el.attrs.style ?? '')) return;
    for (const a of ['aria-label', 'aria-description', 'alt', 'title', 'placeholder']) {
      if (el.attrs[a]) push(el, `attr:${a}`, el.attrs[a], el, el.attrs[a], 0, a);
    }
    if (el.tag === 'rect' && el.attrs.height !== undefined && /^[\d.]+$/.test(el.attrs.height)) {
      const cls = classesOf(el)[0] ?? 'bar';
      const idx = (barCount[cls] = (barCount[cls] ?? -1) + 1);
      nums.push({
        build, route, raw: el.attrs.height, value: el.attrs.height, kind: 'bar-height', embedded: false, compound: false,
        structure: structureOf(el, 'height'), tableHeader: null, rowLabel: null, table: null,
        sentence: `svg bar ${cls} #${idx + 1} (height ${el.attrs.height})`, component: 'unknown', componentBasis: '', key: '', recomputed: 'n/a',
        _owner: el, _block: el, _barClass: cls, _barIndex: idx,
      });
    }
    for (const c of el.children) {
      if (c.type === 'el') { visit(c); continue; }
      const block = blockOf(el);
      const f = flatten(block);
      const at = f.at.get(c);
      if (!at || !/\d/.test(at.text)) continue;
      push(el, el.tag === 'text' ? 'svg-text' : el.tag === 'title' ? 'title' : 'text', at.text, block, f.text, at.base);
    }
  };
  visit(root);
  return nums;
}

// ───────────────────────────────────────────────────────────── components

type TRoot = { tag: string; classes: string[]; tags: Set<string>; ths: string[] | null };
type Comp = { name: string; roots: TRoot[] };

// A .svelte file's markup with scripts, styles and {…} blocks removed, parsed with the same HTML parser.
function templateOf(src: string): string {
  const s = src.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
  let out = '';
  for (let i = 0; i < s.length; ) {
    if (s[i] !== '{') { out += s[i++]; continue; }
    let d = 0, j = i, q: string | null = null;
    for (; j < s.length; j++) {
      const ch = s[j];
      if (q) { if (ch === '\\') j++; else if (ch === q) q = null; continue; }
      if (ch === '"' || ch === "'" || ch === '`') q = ch;
      else if (ch === '{') d++;
      else if (ch === '}' && --d === 0) break;
    }
    if (!/^[#/:@]/.test(s.slice(i + 1, j))) out += out.trimEnd().endsWith('=') ? '"X"' : 'X';
    i = j + 1;
  }
  return out;
}
function tagSet(e: El, acc = new Set<string>()): Set<string> {
  acc.add(e.tag);
  for (const c of kids(e)) tagSet(c, acc);
  return acc;
}
const thTexts = (e: El): string[] => (e.tag === 'th' ? [textOf(e)] : []).concat(kids(e).flatMap(thTexts));

function compFromSource(name: string, file: string): Comp | null {
  if (!existsSync(file)) return null;
  const tree = parseHtml(templateOf(readFileSync(file, 'utf8')));
  const roots = kids(tree).map((r): TRoot => {
    const ths = thTexts(r).map((t) => t.replace(/X/g, ''));
    return { tag: r.tag, classes: (r.attrs.class ?? '').split(/\s+/).filter((c) => c && c !== 'X'), tags: tagSet(r), ths: ths.length ? ths : null };
  });
  return { name, roots };
}

// Components a page uses: its .svx imports, plus what those import.
function importedComponents(srcRoot: string, svxPath: string): Comp[] {
  const found = new Map<string, Comp>();
  const scan = (file: string, depth: number) => {
    if (!existsSync(file) || depth > 2) return;
    for (const m of readFileSync(file, 'utf8').matchAll(/import\s+(\w+)\s+from\s+['"]([^'"]+\.svelte)['"]/g)) {
      const abs = m[2].startsWith('#lib/') ? join(srcRoot, 'src/lib', m[2].slice(5)) : resolve(dirname(file), m[2]);
      if (found.has(m[1])) continue;
      const c = compFromSource(m[1], abs);
      if (c) { found.set(m[1], c); scan(abs, depth + 1); }
    }
  };
  scan(svxPath, 0);
  return [...found.values()];
}

// Mark the root element of every component instance: same tag, the template's static classes present,
// every tag in its subtree known to the template, and (for tables) the same header texts.
function assignComponents(root: El, comps: Comp[]) {
  const matches = (e: El): string[] => {
    const cls = classesOf(e);
    const rTags = tagSet(e);
    const heads = thTexts(e).join('|');
    const names = new Set<string>();
    for (const c of comps) for (const r of c.roots) {
      if (r.tag !== e.tag || !r.classes.every((x) => cls.includes(x))) continue;
      if (![...rTags].every((t) => r.tags.has(t))) continue;
      if (r.ths && heads !== r.ths.join('|')) continue;
      names.add(c.name);
    }
    return [...names];
  };
  const walk = (e: El) => {
    if (e.tag !== '#root' && !SKIP.has(e.tag)) {
      const m = matches(e);
      if (m.length === 1) { e.comp = m[0]; e.compBasis = 'markup shape matches the template of an imported component'; return; }
      if (m.length > 1) { e.comp = `unknown (ambiguous: ${m.join(' | ')})`; e.compBasis = 'several imported components share this markup shape'; return; }
    }
    kids(e).forEach(walk);
  };
  walk(root);
}

function componentFor(e: El, root: El): { name: string; basis: string } {
  let inMain = false, inKb = false, head = false;
  for (let x: El | null = e; x; x = x.parent) {
    if (x.comp) return { name: x.comp, basis: x.compBasis ?? '' };
    if (x.tag === 'main') inMain = true;
    if (x.tag === 'head') head = true;
    if (x.tag === 'div' && classesOf(x).includes('kb')) inKb = true;
  }
  const layout = !!find(root, (y) => y.tag === 'div' && classesOf(y).includes('kb'));
  if (head && layout) return { name: 'layout:runbook', basis: '<svelte:head> in runbook.svelte' };
  if (inMain) return { name: 'page prose', basis: 'inside <main>, outside every imported component (the +page.svx markdown)' };
  if (inKb) return { name: 'layout:runbook', basis: 'page chrome outside <main>' };
  return { name: 'unknown', basis: 'no matching component and no layout frame' };
}

// ───────────────────────────────────────────────────────────── recompute

type Report = import('../../../../src/lib/kb/causes.ts').Report;
type Group = import('../../../../src/lib/kb/causes.ts').CauseGroup;
type Truth = {
  rows: number;
  unique: number;
  merged: Report[];
  groups: Group[];
  owner: string | null;
  readAs: Record<string, number>;
  weeks: { start: string; received: number; merged: number }[];
  max: number;
  distinctTenants: number;
};
const MERGED_EXPR = `uniqueById(reports).filter(r => r.mergedInto === ${TICKET})`;
const GROUPS_EXPR = `groupByCause(${MERGED_EXPR}, tenantOf)`;

async function loadTruth(srcRoot: string): Promise<Truth> {
  const causes: typeof import('../../../../src/lib/kb/causes.ts') = await import(join(srcRoot, 'src/lib/kb/causes.ts'));
  const reports = JSON.parse(readFileSync(join(srcRoot, 'src/lib/data/reports-4471.json'), 'utf8')) as Report[];
  const notes = JSON.parse(readFileSync(join(srcRoot, 'src/lib/data/desk-notes.json'), 'utf8')).oneDayMove as string[];
  // bun has no import.meta.glob: load src/lib/data/tenants/*.json ourselves (what locales.ts does at build time)
  const dir = join(srcRoot, 'src/lib/data/tenants');
  const byHandle = new Map(readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => {
    const t = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    return [t.handle, t] as const;
  }));
  const tenantOf = (r: Pick<Report, 'tenant'>) => byHandle.get(r.tenant);
  const uniq = causes.uniqueById(reports);
  const merged = uniq.filter((r) => r.mergedInto === TICKET);
  const groups = causes.groupByCause(merged, tenantOf);
  // QueueTimeline.svelte, mirrored: a component cannot be imported by bun; keep in step with its $derived.by
  const WEEK = 7 * 86_400_000;
  const day = (iso: string) => Date.parse(iso.slice(0, 10));
  const start = day('2026-03-30');
  const count = Math.ceil((day('2026-10-05') - start) / WEEK);
  const rows = Array.from({ length: count }, (_, i) => ({ at: start + i * WEEK, received: 0, merged: 0 }));
  const weekOf = (iso: string) => rows[Math.floor((day(iso) - start) / WEEK)];
  for (const r of merged) {
    const a = weekOf(r.receivedAt); if (a) a.received++;
    const b = r.mergedAt ? weekOf(r.mergedAt) : undefined; if (b) b.merged++;
  }
  const readAs: Record<string, number> = {};
  for (const g of groups) readAs[g.cause] = causes.readAs(g, notes);
  return {
    rows: reports.length, unique: uniq.length, merged, groups, owner: causes.ticketCause(groups, TICKET), readAs,
    weeks: rows.map((w) => ({ start: new Date(w.at).toISOString().slice(0, 10), received: w.received, merged: w.merged })),
    max: Math.max(...rows.flatMap((w) => [w.received, w.merged])),
    distinctTenants: new Set(merged.map((r) => r.tenant)).size,
  };
}

type Verdict = { recomputed: boolean | 'n/a'; expression?: string; expected?: string; note?: string };
const na = (note: string): Verdict => ({ recomputed: 'n/a', note });
const cmp = (shown: string, expected: string | number, expression: string): Verdict => ({
  recomputed: shown.replace(/,/g, '') === String(expected), expression, expected: String(expected),
});
const grp = (t: Truth, cause: string) => t.groups.find((g) => g.cause === cause);
const grpExpr = (cause: string) => `${GROUPS_EXPR}.find(g => g.cause === "${cause}")`;

function recompute(n: Num, t: Truth): Verdict {
  if (n.kind === 'bar-height') {
    const w = t.weeks[n._barIndex!];
    if (!w) return { recomputed: false, expression: `weeks[${n._barIndex}]`, expected: 'no such week', note: 'more bars rendered than weeks recomputed' };
    const v = n._barClass === 'in' ? w.received : w.merged;
    const h = (v / t.max) * 100;
    return {
      recomputed: Math.abs(h - Number(n.raw)) < 1e-6,
      expression: `weeks[${n._barIndex}].${n._barClass === 'in' ? 'received' : 'merged'} / max * 100 (week of ${w.start}: ${v}, max ${t.max})`,
      expected: String(h), note: `bar encodes ${v} reports`,
    };
  }
  const before = n._before ?? '';
  const after = n._after ?? '';
  if (before.endsWith('#') && n.raw === String(TICKET)) return na('ticket id (the `ticket` prop in the page source)');
  if (before.endsWith('#') && /^\d{1,2}$/.test(n.raw)) return na('GitHub issue number');

  if (n.component === 'CauseTable') {
    if (n.table) {
      const col = (n.tableHeader ?? '').trim();
      const g = grp(t, n.rowLabel ?? '');
      if (!g) return { recomputed: false, expression: grpExpr(n.rowLabel ?? '?'), expected: 'no such cause', note: `no group "${n.rowLabel}" in the data` };
      if (col === 'reports') return cmp(n.raw, g.reports.length, `${grpExpr(g.cause)}.reports.length`);
      if (col === 'tenants') return cmp(n.raw, g.tenants, `${grpExpr(g.cause)}.tenants`);
      if (col === 'tagged as') {
        const tags = [...n.sentence.matchAll(/([\w-]+)\s*×\s*(\d+)/g)];
        const m = tags[n._ord!] ?? tags.find((x) => x[2] === n.raw);
        if (!m) return { recomputed: false, note: 'could not read "tag ×n" from the cell', expression: `${grpExpr(g.cause)}.taggedAs[tag]` };
        return cmp(n.raw, g.taggedAs[m[1]] ?? 0, `${grpExpr(g.cause)}.taggedAs["${m[1]}"]`);
      }
      if (col === 'seen') {
        const first = n._ord === 0;
        return cmp(n.raw, first ? g.firstSeen : g.lastSeen, `${grpExpr(g.cause)}.${first ? 'firstSeen' : 'lastSeen'}`);
      }
      return na(`CauseTable column "${col}" is not data`);
    }
    if (/strong\[1\]$/.test(n.structure)) return cmp(n.raw, t.merged.length, `${MERGED_EXPR}.length`);
    if (/strong\[2\]$/.test(n.structure)) return cmp(n.raw, t.groups.length, `${GROUPS_EXPR}.length`);
    const note = /^(\d+) reports read as a one-day move; filed under (\S+)/.exec(n.sentence);
    if (note) {
      const g = grp(t, note[2]);
      return cmp(n.raw, g ? t.readAs[g.cause] : 'no such cause', `readAs(${grpExpr(note[2])}, desk-notes.oneDayMove)`);
    }
    return { recomputed: false, note: 'CauseTable number with no recomputation rule' };
  }

  if (n.component === 'QueueTimeline') {
    if (n.kind === 'svg-text') {
      const k = Number(/\[(\d+)\]$/.exec(n.structure)?.[1] ?? '1') - 1;
      return cmp(n.raw, t.weeks[k * 4]?.start.slice(5) ?? 'no such week', `label(weeks[${k * 4}].at), the week start as MM-DD`);
    }
    return na('QueueTimeline caption/aria text, not data');
  }

  // prose claims: "<N> reports", "<N> unique", "<N> rows", "<N> tenants", "<N> causes"
  if (!n.embedded && !n.compound && n.kind === 'text') {
    const noun = /^\s*(?:(?:unique|merged)\s+)?(reports?|rows|tenants|causes)\b/i.exec(after);
    if (noun) {
      const w = noun[1].toLowerCase().replace(/s$/, '');
      const cands: [string, number][] = [];
      if (w === 'report') {
        cands.push([`${MERGED_EXPR}.length`, t.merged.length], ['uniqueById(reports).length', t.unique]);
        for (const g of t.groups) cands.push([`${grpExpr(g.cause)}.reports.length`, g.reports.length], [`readAs(${grpExpr(g.cause)}, oneDayMove)`, t.readAs[g.cause]]);
      } else if (w === 'row') cands.push(['reports.length (rows as exported, overlaps included)', t.rows], ['uniqueById(reports).length', t.unique]);
      else if (w === 'tenant') cands.push([`new Set(${MERGED_EXPR}.map(r => r.tenant)).size`, t.distinctTenants], ...t.groups.map((g): [string, number] => [`${grpExpr(g.cause)}.tenants`, g.tenants]));
      else if (w === 'cause') cands.push([`${GROUPS_EXPR}.length`, t.groups.length]);
      const hit = cands.find(([, v]) => String(v) === n.raw);
      if (hit) return { recomputed: true, expression: hit[0], expected: String(hit[1]) };
      return { recomputed: false, expression: cands[0]?.[0], expected: cands.map(([e, v]) => `${v} = ${e}`).join(' ; '), note: `the page says "${n.raw} ${noun[1]}" but no recomputation gives ${n.raw}` };
    }
  }
  return na('not a claim about the #4471 data (date, version, list number, id)');
}

// ───────────────────────────────────────────────────────────── a build → numbers

const routeOf = (dir: string, file: string) => {
  const r = '/' + relative(dir, file).replace(/\\/g, '/').replace(/\.html$/, '').replace(/(^|\/)index$/, '');
  return r === '/' ? '/' : r.replace(/\/$/, '');
};
function htmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    if (f === '_app') return [];
    const p = join(dir, f);
    return statSync(p).isDirectory() ? htmlFiles(p) : f.endsWith('.html') ? [p] : [];
  });
}
const maskDigits = (s: string) => s.replace(NUM_RE, '#');

type PageInfo = { route: string; reviewed?: string; renderedDaysAgo?: number };
async function readBuild(build: Num['build'], htmlDir: string, srcRoot: string, failures: any[]) {
  let truth: Truth | null = null;
  try { truth = await loadTruth(srcRoot); }
  catch (e) { failures.push({ build, route: '*', reason: `could not load the data / causes.ts from ${srcRoot}: ${(e as Error).message}` }); }
  const out: Num[] = [];
  const pages: PageInfo[] = [];
  for (const file of htmlFiles(htmlDir).sort()) {
    const route = routeOf(htmlDir, file);
    const root = parseHtml(readFileSync(file, 'utf8'));
    const svx = join(srcRoot, 'src/routes', route, '+page.svx');
    const svxText = existsSync(svx) ? readFileSync(svx, 'utf8') : '';
    assignComponents(root, existsSync(svx) ? importedComponents(srcRoot, svx) : []);
    const nums = extractNumbers(root, route, build);

    // diff key: the context a number sits in. Table cells by table + row + column; everything else by its
    // sentence with digits masked, so a changed number is the SAME context with a different value.
    const instances = new Map<string, El[]>();
    for (const n of nums) {
      const c = componentFor(n._owner!, root);
      n.component = c.name;
      n.componentBasis = c.basis;
      const base = n.table ? `table[${n.table}] row[${n.rowLabel}] col[${n.tableHeader}]`
        : n.kind === 'bar-height' ? `bar ${n._barClass} #${n._barIndex! + 1}`
        : `${n.kind} ${maskDigits(n.sentence)}`;
      const list = instances.get(base) ?? [];
      if (!list.includes(n._block!)) list.push(n._block!);
      instances.set(base, list);
      n.key = `${base} #${list.indexOf(n._block!) + 1}`;
    }
    if (truth) {
      for (const n of nums) {
        try { Object.assign(n, recompute(n, truth)); }
        catch (e) { n.recomputed = false; n.note = `recompute threw: ${(e as Error).message}`; }
      }
      const bars = nums.filter((n) => n._barClass === 'in').length;
      if (bars && bars !== truth.weeks.length) failures.push({ build, route, reason: `QueueTimeline rendered ${bars} weeks, the recomputation has ${truth.weeks.length}` });
    }
    for (const n of nums) {
      if (n.recomputed === false) failures.push({ build, route, raw: n.raw, component: n.component, structure: n.structure, sentence: n.sentence, expression: n.expression, expected: n.expected, reason: n.note ?? 'rendered value differs from the recomputation' });
    }
    const fm = /^reviewed:\s*'?(\d{4}-\d{2}-\d{2})/m.exec(svxText)?.[1];
    const ago = /· (\d+) days ago/.exec(nums.find((n) => /days ago/.test(n.sentence))?.sentence ?? '')?.[1];
    pages.push({ route, reviewed: fm, renderedDaysAgo: ago ? Number(ago) : undefined });
    out.push(...nums);
  }
  return { nums: out, pages, truth };
}

// ───────────────────────────────────────────────────────────── the as-exported build

const sh = (cmd: string, args: string[], cwd: string) => spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
function removeWorktree() {
  sh('git', ['worktree', 'remove', '--force', WORKTREE], REPO);
  rmSync(WORKTREE, { recursive: true, force: true });
  sh('git', ['worktree', 'prune'], REPO);
}

// fn runs while the worktree still exists (it needs the exported src/ for the recomputation); removed in finally
async function withExportedBuild<T>(fn: (htmlDir: string, srcRoot: string) => Promise<T>): Promise<T> {
  removeWorktree(); // a leftover from an interrupted run
  mkdirSync(dirname(WORKTREE), { recursive: true });
  const onSignal = () => { removeWorktree(); process.exit(130); };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  try {
    const add = sh('git', ['worktree', 'add', '--detach', WORKTREE, EXPORT_COMMIT], REPO);
    if (add.status !== 0) throw new Error(`git worktree add failed: ${add.stderr}`);
    for (const f of BUILD_FILES) {
      mkdirSync(dirname(join(WORKTREE, f)), { recursive: true });
      cpSync(join(REPO, f), join(WORKTREE, f));
    }
    symlinkSync(join(REPO, 'node_modules'), join(WORKTREE, 'node_modules'));
    const b = sh('npm', ['run', 'build'], WORKTREE);
    if (b.status !== 0) throw new Error(`npm run build failed in the exported worktree:\n${(b.stdout + b.stderr).slice(-2000)}`);
    return await fn(join(WORKTREE, 'build'), WORKTREE);
  } finally {
    removeWorktree();
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }
}

// ───────────────────────────────────────────────────────────── diff

type Side = { numbers: string[]; structure: string; sentence: string; component: string };
function groupByKey(nums: Num[]): Map<string, Side> {
  const m = new Map<string, Side>();
  for (const n of nums) {
    const k = `${n.route}\u0000${n.key}`;
    const g = m.get(k) ?? { numbers: [], structure: n.structure, sentence: n.sentence, component: n.component };
    g.numbers.push(n.raw);
    m.set(k, g);
  }
  return m;
}
function diffBuilds(ex: Num[], cur: Num[], exPages: string[], curPages: string[]) {
  const diff: any[] = [];
  for (const r of exPages) if (!curPages.includes(r)) diff.push({ change: 'page-only-exported', route: r });
  for (const r of curPages) if (!exPages.includes(r)) diff.push({ change: 'page-only-current', route: r });
  const both = new Set(exPages.filter((r) => curPages.includes(r)));
  const a = groupByKey(ex.filter((n) => both.has(n.route)));
  const b = groupByKey(cur.filter((n) => both.has(n.route)));
  const volatile = (s: Side | undefined) => (s && /days ago/.test(s.sentence) ? { volatile: 'depends on the build date (daysSince in runbook.svelte)' } : {});
  for (const [k, g] of a) {
    const [route, context] = k.split('\u0000');
    const h = b.get(k);
    if (!h) diff.push({ change: 'only-exported', route, context, exported: g, current: null });
    else if (g.numbers.join('|') !== h.numbers.join('|')) diff.push({ change: 'changed', route, context, exported: g, current: h, ...volatile(g) });
  }
  for (const [k, h] of b) if (!a.has(k)) {
    const [route, context] = k.split('\u0000');
    diff.push({ change: 'only-current', route, context, exported: null, current: h, ...volatile(h) });
  }
  return diff;
}

// ───────────────────────────────────────────────────────────── what only a browser would compute

function clientSideScan(srcRoot: string) {
  const files = ['src/lib/kb', 'src/lib/layouts'].flatMap((d) => readdirSync(join(srcRoot, d)).map((f) => join(d, f))).filter((f) => /\.(svelte|ts)$/.test(f));
  const rules: [RegExp, string][] = [
    [/new Date\(\s*\)|Date\.now\(\)/, 'reads the clock: runs again in the browser on hydration, not frozen at build'],
    [/Math\.random/, 'random'],
    [/onMount|\$effect/, 'runs only in the browser'],
    [/\bwindow\b|\bdocument\.|localStorage|matchMedia|navigator\./, 'browser global'],
    [/\bfetch\(/, 'network at read time'],
    [/\$state\(|bind:/, 'interactive state: changes after a click, absent from the prerendered HTML'],
    [/import\.meta\.glob/, 'build-time glob: frozen in the HTML, same in the browser'],
  ];
  return files.flatMap((f) => {
    const text = readFileSync(join(srcRoot, f), 'utf8');
    const hits = rules.filter(([re]) => re.test(text)).map(([, why]) => why);
    return hits.length ? [{ file: f, constructs: hits }] : [];
  });
}

// ───────────────────────────────────────────────────────────── printing

function printTable(title: string, nums: Num[]) {
  console.log(`\n== ${title}`);
  const rows = nums.filter((n) => n.kind !== 'bar-height');
  const bars = nums.filter((n) => n.kind === 'bar-height');
  const w = (s: string, k: number) => (s.length > k ? s.slice(0, k - 1) + '…' : s.padEnd(k));
  console.log(`${w('number', 11)} ${w('recomp', 6)} ${w('component', 14)} where`);
  for (const n of rows) {
    const where = n.table ? `${n.rowLabel} / ${n.tableHeader || '(blank col)'}` : `${n.kind === 'text' ? '' : n.kind + ': '}${n.sentence}`;
    console.log(`${w(n.raw + (n.embedded ? '*' : ''), 11)} ${w(String(n.recomputed), 6)} ${w(n.component, 14)} ${where.slice(0, 80)}`);
  }
  if (bars.length) console.log(`(+ ${bars.length} SVG bar heights, ${bars.filter((n) => n.recomputed === true).length} recomputed true; they encode the weekly received/merged counts)   * = glued to a letter`);
}

// ───────────────────────────────────────────────────────────── main

const outIdx = process.argv.indexOf('--out');
if (outIdx < 0 || !process.argv[outIdx + 1]) {
  console.error('usage: bun kb-view.ts --out <views.json>');
  process.exit(2);
}
const outPath = resolve(process.argv[outIdx + 1]);
const failures: any[] = [];
const builtAt = new Date().toISOString();

const ex = await withExportedBuild((htmlDir, srcRoot) => readBuild('exported', htmlDir, srcRoot, failures));
const cur = await readBuild('current', join(REPO, 'rendered'), REPO, failures);
const diff = diffBuilds(ex.nums, cur.nums, ex.pages.map((p) => p.route), cur.pages.map((p) => p.route));

// runbook.svelte computes "N days ago" with new Date() — at build time in the HTML, and again in the browser
const today = Date.now();
const daysAgoRecomputedInBrowser = [...ex.pages.map((p) => ({ build: 'exported', ...p })), ...cur.pages.map((p) => ({ build: 'current', ...p }))]
  .filter((p) => p.reviewed && p.renderedDaysAgo !== undefined)
  .map((p) => ({ build: p.build, route: p.route, reviewed: p.reviewed, renderedDaysAgo: p.renderedDaysAgo, daysAgoIfReadToday: Math.floor((today - new Date(p.reviewed!).getTime()) / 86_400_000) }));

const strip = (n: Num) => { const { _owner, _block, _before, _after, _ord, _barClass, _barIndex, ...rest } = n; return rest; };
const summary = (t: Truth | null) => t && {
  uniqueReports: t.unique, rows: t.rows, merged: t.merged.length, ticketOwnerCause: t.owner,
  causes: t.groups.map((g) => ({ cause: g.cause, reports: g.reports.length, tenants: g.tenants, taggedAs: g.taggedAs, seen: [g.firstSeen, g.lastSeen], readAsOneDayMove: t.readAs[g.cause] })),
  weeks: t.weeks,
};
const view = {
  builtAt,
  exportedCommit: EXPORT_COMMIT,
  exported: ex.nums.map(strip),
  current: cur.nums.map(strip),
  diff,
  recomputeFailures: failures,
  recomputed: { exported: summary(ex.truth), current: summary(cur.truth) },
  clientSide: { scan: clientSideScan(REPO), daysAgoRecomputedInBrowser },
  pages: { exported: ex.pages.map((p) => p.route), current: cur.pages.map((p) => p.route) },
};
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(view, null, 2) + '\n');

printTable('/kb/incidents/4471  [as exported]', ex.nums.filter((n) => n.route === '/kb/incidents/4471'));
printTable('/kb/incidents/4471  [current rendered/]', cur.nums.filter((n) => n.route === '/kb/incidents/4471'));
printTable('/kb/incidents/4471-split  [current rendered/]', cur.nums.filter((n) => n.route === '/kb/incidents/4471-split'));
console.log(`\n${ex.nums.length} numbers exported, ${cur.nums.length} current, ${diff.length} diff entries, ${failures.length} recompute failures -> ${outPath}`);
