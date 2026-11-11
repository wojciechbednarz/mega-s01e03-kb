<script lang="ts">
  // What a big ticket really holds: every report placed by what it says (symptoms.ts),
  // then by which fix would stop it. Counts are computed here, never typed into a page.
  import reports from '#lib/data/reports-4471.json';
  import notes from '#lib/data/desk-notes.json';
  import split from '#lib/data/split-4471.json';
  import { uniqueById, causeOf, type Report, type Tenant } from '#lib/kb/causes';
  import { place, type Placed } from '#lib/kb/symptoms';

  let { ticket }: { ticket: number } = $props();

  const tenantFiles = import.meta.glob<Tenant>('/src/lib/data/tenants/*.json', { eager: true, import: 'default' });
  const tenants = new Map(Object.values(tenantFiles).map((t) => [t.handle, t]));

  type Problem = 'parser' | 'hint' | 'time-zone' | 'unplaced';
  const merged = uniqueById(reports as Report[]).filter((r) => r.mergedInto === ticket);
  const placed = place(merged, notes.oneDayMove);

  function problemOf(r: Report, p: Placed): Problem {
    if (p.symptom === 'one-day') return 'time-zone';
    if (p.symptom === 'swap') return causeOf(r, tenants.get(r.tenant)) ?? 'unplaced';
    return 'unplaced';
  }

  const ORDER: Problem[] = ['parser', 'hint', 'time-zone', 'unplaced'];
  const rows = ORDER.map((problem) => {
    const rs = merged.filter((r) => problemOf(r, placed.get(r.id)!) === problem);
    const by = (e: Placed['evidence']) => rs.filter((r) => placed.get(r.id)!.evidence === e).length;
    // What users say: the subject lines they wrote most, with counts (the kb holds the distilled
    // picture; the ticket holds the reports themselves).
    const subjects = new Map<string, number>();
    for (const r of rs) subjects.set(r.subject, (subjects.get(r.subject) ?? 0) + 1);
    const say = [...subjects.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 2);
    return { problem, count: rs.length, text: by('text'), desk: by('desk'), inferred: by('inferred'), say };
  }).filter((row) => row.count > 0);

  const inferredCount = merged.filter((r) => placed.get(r.id)!.evidence === 'inferred').length;

  const ticketOf = (p: Problem) => (split.tickets as Record<string, { label: string; url: string }>)[p];
</script>

<p class="sum">
  <strong>{merged.length}</strong> reports merged into #{ticket} ·
  <strong>{rows.filter((r) => r.problem !== 'unplaced').length}</strong> problems
</p>

<table>
  <thead>
    <tr><th>problem</th><th>ticket</th><th>reports</th><th>by text</th><th>by desk note</th><th>inferred</th><th>users say most</th></tr>
  </thead>
  <tbody>
    {#each rows as row (row.problem)}
      <tr>
        <td><code>{row.problem}</code></td>
        <td>
          {#if ticketOf(row.problem)}
            <a href={ticketOf(row.problem).url}>{ticketOf(row.problem).label}</a>
          {:else}
            no ticket yet
          {/if}
        </td>
        <td>{row.count}</td>
        <td>{row.text}</td>
        <td>{row.desk}</td>
        <td>{row.inferred}</td>
        <td class="say">{row.say.map(([subject, n]) => `“${subject}” ×${n}`).join(' · ')}</td>
      </tr>
    {/each}
  </tbody>
</table>

{#if inferredCount}
  <p class="note">{inferredCount} {inferredCount === 1 ? 'report names' : 'reports name'} no date and {inferredCount === 1 ? 'was' : 'were'} placed by inference from same-tenant, same-channel reports; which ones, and why, is in each ticket.</p>
{/if}

<style>
  .sum { margin: 1rem 0 0.5rem; }
  table { border-collapse: collapse; width: 100%; font-size: 0.92rem; }
  th, td { text-align: left; padding: 0.35rem 0.6rem; border-bottom: 1px solid var(--line, #ddd); }
  .note { color: var(--muted, #666); font-size: 0.88rem; }
  .say { color: var(--muted, #666); font-size: 0.85rem; }
</style>
