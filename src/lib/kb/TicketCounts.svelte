<script lang="ts">
  // The tickets split out of a big ticket, each with the count a reader sees for it — computed with the
  // desk's own functions as exported (causes.ts groupByCause / readAs, locales.ts tenantOf), the same view
  // CauseTable shows. Each GitHub ticket takes its count from its row here.
  import reports from '#lib/data/reports-4471.json';
  import notes from '#lib/data/desk-notes.json';
  import split from '#lib/data/split-4471.json';
  import { groupByCause, readAs, uniqueById, type Report } from '#lib/kb/causes';
  import { tenantOf } from '#lib/kb/locales';

  let { ticket }: { ticket: number } = $props();

  const merged = uniqueById(reports as Report[]).filter((r) => r.mergedInto === ticket);
  const groups = groupByCause(merged, tenantOf);
  const tickets = split.tickets as Record<string, { label: string; url: string }>;
  const rows = [
    ...groups.map((g) => ({ problem: g.cause as string, count: g.reports.length, from: `the ${g.cause} row of the #${ticket} table` })),
    ...groups.filter((g) => readAs(g, notes.oneDayMove) > 0).map((g) => ({
      problem: 'one-day-move', count: readAs(g, notes.oneDayMove), from: `the note under the #${ticket} table (filed under ${g.cause} by tenant)`,
    })),
  ];
</script>

<table>
  <thead><tr><th>problem</th><th>ticket</th><th>reports</th><th>where a reader sees it</th></tr></thead>
  <tbody>
    {#each rows as row (row.problem)}
      <tr>
        <td><code>{row.problem}</code></td>
        <td>{#if tickets[row.problem]}<a href={tickets[row.problem].url}>{tickets[row.problem].label}</a>{/if}</td>
        <td>{row.count}</td>
        <td>{row.from}</td>
      </tr>
    {/each}
  </tbody>
</table>
