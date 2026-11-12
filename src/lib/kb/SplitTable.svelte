<script lang="ts">
  // What a big ticket really holds, by the desk's own rule: every report's cause from causes.ts
  // (tenant locale + booking form + channel). Reports the desk read differently (desk-notes.json)
  // are counted where they're filed and footnoted, as the desk does. Counts are computed, never typed.
  import reports from '#lib/data/reports-4471.json';
  import notes from '#lib/data/desk-notes.json';
  import split from '#lib/data/split-4471.json';
  import { uniqueById, causeOf, CAUSES, readAs, type Report, type Tenant } from '#lib/kb/causes';

  let { ticket }: { ticket: number } = $props();

  const tenantFiles = import.meta.glob<Tenant>('/src/lib/data/tenants/*.json', { eager: true, import: 'default' });
  const tenants = new Map(Object.values(tenantFiles).map((t) => [t.handle, t]));

  const countBy = (split as { countBy?: string }).countBy;
  const merged = (countBy === 'rows' ? (reports as Report[]) : uniqueById(reports as Report[])).filter((r) => r.mergedInto === ticket);
  const rows = CAUSES.map((cause) => {
    // counted the way the desk counts: by its own intake tag when split-4471.json says so
    const rs = merged.filter((r) => (countBy === 'intakeTag' ? r.meta.intakeTag : causeOf(r, tenants.get(r.tenant))) === cause);
    const subjects = new Map<string, number>();
    for (const r of rs) subjects.set(r.subject, (subjects.get(r.subject) ?? 0) + 1);
    const say = [...subjects.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 2);
    const g = { reports: rs } as Parameters<typeof readAs>[0];
    return { cause, count: rs.length, say, oneDay: readAs(g, notes.oneDayMove) };
  }).filter((row) => row.count > 0);

  const ticketOf = (c: string) => (split.tickets as Record<string, { label: string; url: string }>)[c];
</script>

<p class="sum">
  <strong>{merged.length}</strong> reports merged into #{ticket} ·
  <strong>{rows.length}</strong> {rows.length === 1 ? 'cause' : 'causes'}
</p>

<table>
  <thead><tr><th>cause</th><th>ticket</th><th>reports</th><th>users say most</th></tr></thead>
  <tbody>
    {#each rows as row (row.cause)}
      <tr>
        <td><code>{row.cause}</code></td>
        <td>
          {#if ticketOf(row.cause)}<a href={ticketOf(row.cause).url}>{ticketOf(row.cause).label}</a>{:else}no ticket yet{/if}
        </td>
        <td>{row.count}</td>
        <td class="say">{row.say.map(([subject, n]) => `“${subject}” ×${n}`).join(' · ')}</td>
      </tr>
    {/each}
  </tbody>
</table>

{#each rows as row (row.cause)}
  {#if row.oneDay}
    <p class="note">{row.oneDay} of the <code>{row.cause}</code> reports the desk read as a one-day move (<code>desk-notes.json</code>); counted where they're filed, footnoted here{#if ticketOf('one-day-move')}; the problem itself: <a href={ticketOf('one-day-move').url}>{ticketOf('one-day-move').label}</a>{/if}.</p>
  {/if}
{/each}

<style>
  .sum { margin: 1rem 0 0.5rem; }
  table { border-collapse: collapse; width: 100%; font-size: 0.92rem; }
  th, td { text-align: left; padding: 0.35rem 0.6rem; border-bottom: 1px solid var(--line, #ddd); }
  .note, .say { color: var(--muted, #666); font-size: 0.88rem; }
</style>
