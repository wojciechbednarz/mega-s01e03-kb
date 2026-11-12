<script lang="ts">
  // What users report most, per problem in a big ticket (lesson: support tickets → "the state of the product
  // and the most important things users talk about"). Subjects counted once per report, by the desk's own
  // cause rule (causes.ts) and its one-day notes (desk-notes.json). Computed, never typed.
  import reports from '#lib/data/reports-4471.json';
  import notes from '#lib/data/desk-notes.json';
  import split from '#lib/data/split-4471.json';
  import { uniqueById, causeOf, CAUSES, type Report, type Tenant } from '#lib/kb/causes';
  import { oneDayMoves } from '#lib/kb/one-day';

  let { ticket, top = 2 }: { ticket: number; top?: number } = $props();

  const tenantFiles = import.meta.glob<Tenant>('/src/lib/data/tenants/*.json', { eager: true, import: 'default' });
  const tenants = new Map(Object.values(tenantFiles).map((t) => [t.handle, t]));
  const merged = uniqueById(reports as Report[]).filter((r) => r.mergedInto === ticket);
  const most = (rs: Report[]) => {
    const n = new Map<string, number>();
    for (const r of rs) n.set(r.subject, (n.get(r.subject) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, top);
  };
  const rows = [
    ...CAUSES.map((c) => ({ problem: c, say: most(merged.filter((r) => causeOf(r, tenants.get(r.tenant)) === c)) })),
    { problem: 'one-day-move', say: most(merged.filter((r) => oneDayMoves(merged, notes.oneDayMove).includes(r.id))) },
  ];
  const ticketOf = (p: string) => (split.tickets as Record<string, { label: string; url: string }>)[p];
</script>

<table>
  <thead><tr><th>problem</th><th>ticket</th><th>users report most</th></tr></thead>
  <tbody>
    {#each rows as row (row.problem)}
      <tr>
        <td><code>{row.problem}</code></td>
        <td>{#if ticketOf(row.problem)}<a href={ticketOf(row.problem).url}>{ticketOf(row.problem).label}</a>{/if}</td>
        <td>{row.say.map(([s, n]) => `“${s}” ×${n}`).join(' · ')}</td>
      </tr>
    {/each}
  </tbody>
</table>
