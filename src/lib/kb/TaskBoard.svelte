<script lang="ts">
  // The desk's work in four columns, read from each task page's frontmatter. A task's status lives in
  // its frontmatter, not its folder, so a link to a task survives when the task moves on.
  type Meta = { title: string; status: string; reviewed: string };
  const pages = import.meta.glob<{ metadata: Meta }>('/src/routes/kb/tasks/*/+page.svx', { eager: true });
  const COLUMNS = ['implemented', 'active', 'planned', 'archived'];
  const tasks = Object.entries(pages).map(([path, mod]) => ({
    href: path.replace('/src/routes', '').replace('/+page.svx', ''),
    ...mod.metadata,
  }));
  const column = (c: string) => tasks.filter((t) => t.status === c).sort((a, b) => a.title.localeCompare(b.title));
</script>

<div class="board">
  {#each COLUMNS as c (c)}
    <section>
      <h3>{c} <span>{column(c).length}</span></h3>
      {#each column(c) as t (t.href)}
        <a class="card" href={t.href}>{t.title}</a>
      {:else}
        <p class="empty">none</p>
      {/each}
    </section>
  {/each}
</div>

<style>
  .board { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: 0.75rem; }
  section { border: 1px solid var(--line, #ddd); border-radius: 6px; padding: 0.5rem; }
  h3 { margin: 0 0 0.5rem; font-size: 0.9rem; text-transform: uppercase; }
  h3 span { color: var(--muted, #666); }
  .card { display: block; padding: 0.4rem; margin-bottom: 0.4rem; border: 1px solid var(--line, #ddd); border-radius: 4px; }
  .empty { color: var(--muted, #666); font-size: 0.85rem; }
</style>
