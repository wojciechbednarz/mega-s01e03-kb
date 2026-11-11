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
    return { problem, count: rs.length, text: by('text'), desk: by('desk'), inferred: by('inferred'), ids: rs.map((r) => r.id) };
  }).filter((row) => row.count > 0);

  const inferred = merged
    .filter((r) => placed.get(r.id)!.evidence === 'inferred')
    .map((r) => ({ id: r.id, problem: problemOf(r, placed.get(r.id)!), basis: placed.get(r.id)!.basis }));

  const ticketOf = (p: Problem) => (split.tickets as Record<string, { label: string; url: string }>)[p];
</script>

<p class="sum">
  <strong>{merged.length}</strong> reports merged into #{ticket} ·
  <strong>{rows.filter((r) => r.problem !== 'unplaced').length}</strong> problems
</p>

<table>
  <thead>
    <tr><th>problem</th><th>ticket</th><th>reports</th><th>by text</th><th>by desk note</th><th>inferred</th></tr>
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
      </tr>
    {/each}
  </tbody>
</table>

{#if inferred.length}
  <p class="note">Inferred, not read from the report: the body names no date, so the report takes the symptom its siblings share.</p>
  <ul class="note">
    {#each inferred as i (i.id)}
      <li><code>{i.id}</code> → <code>{i.problem}</code>: {i.basis}</li>
    {/each}
  </ul>
{/if}

<style>
  .sum { margin: 1rem 0 0.5rem; }
  table { border-collapse: collapse; width: 100%; font-size: 0.92rem; }
  th, td { text-align: left; padding: 0.35rem 0.6rem; border-bottom: 1px solid var(--line, #ddd); }
  .note { color: var(--muted, #666); font-size: 0.88rem; }
</style>
