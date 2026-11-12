<script lang="ts">
  // The tickets split out of a big ticket, each with the count a reader sees for it — computed with the
  // desk's own functions as exported (causes.ts groupByCause / readAs, locales.ts tenantOf), the same view
  // CauseTable shows. Each GitHub ticket takes its count from its row here.
  import reports from '#lib/data/reports-4471.json';
  import notes from '#lib/data/desk-notes.json';
  import split from '#lib/data/split-4471.json';
  import { groupByCause, readAs, uniqueById, type Report } from '#lib/kb/causes';
  import { tenantOf } from '#lib/kb/locales';
  import { oneDayMoves } from '#lib/kb/one-day';

  let { ticket }: { ticket: number } = $props();

  const merged = uniqueById(reports as Report[]).filter((r) => r.mergedInto === ticket);
  const groups = groupByCause(merged, tenantOf);
  // the desk's one-day notes, as far as each report's own text supports them (one-day.ts)
  const oneDay = oneDayMoves(merged, notes.oneDayMove);
  const tickets = split.tickets as Record<string, { label: string; url: string }>;
  const rows = [
    // each report counted once: a cause's row less the one-day reports the note files under it (they are their own ticket)
    ...groups.map((g) => ({ problem: g.cause as string, count: g.reports.length - (tickets['one-day-move'] ? readAs(g, oneDay) : 0),
      from: readAs(g, oneDay) && tickets['one-day-move'] ? `the ${g.cause} row of the #${ticket} table, less the note under it` : `the ${g.cause} row of the #${ticket} table` })),
    ...groups.filter((g) => readAs(g, oneDay) > 0).map((g) => ({
      problem: 'one-day-move', count: readAs(g, oneDay), from: `the note under the #${ticket} table, where the report's own text shows a one-day move (filed under ${g.cause} by tenant)`,
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
