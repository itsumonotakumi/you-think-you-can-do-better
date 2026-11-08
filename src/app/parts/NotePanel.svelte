<script lang="ts">
  // 記録: 判断ポイントの notable と自由記述。記者会見で使う
  import type { Localized, PlayerNote } from '../../engine/types';
  import { t, loc } from '../../i18n';
  import { formatClock } from './logic';

  let {
    notable,
    notes,
    addedIds,
    status = '',
    onaddnotable,
    onaddfree,
  }: {
    notable: { id: string; text: Localized }[];
    notes: PlayerNote[];
    addedIds: string[];
    status?: string;
    onaddnotable: (item: { id: string; text: Localized }) => void;
    onaddfree: (text: string) => void;
  } = $props();

  let draft = $state('');

  function submitFree(event: SubmitEvent): void {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onaddfree(text);
    draft = '';
  }

  const reversed = $derived([...notes].reverse());
</script>

<div class="note-panel">
  {#if notable.length > 0}
    <h3>{t('sb.notes.notable')}</h3>
    <ul class="notable">
      {#each notable as item (item.id)}
        {@const added = addedIds.includes(item.id)}
        <li>
          <span class="notable-text">{loc(item.text)}</span>
          <button type="button" disabled={added} onclick={() => onaddnotable(item)}>
            {added ? t('sb.notes.added') : t('sb.notes.add')}
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  <form class="free" onsubmit={submitFree}>
    <label for="note-free">{t('sb.notes.freeLabel')}</label>
    <textarea
      id="note-free"
      bind:value={draft}
      maxlength="200"
      rows="2"
      placeholder={t('sb.notes.placeholder')}
    ></textarea>
    <button type="submit" disabled={draft.trim().length === 0}>{t('sb.notes.submit')}</button>
  </form>

  <p class="hint">{t('sb.notes.useAtPress')}</p>
  <p class="status" aria-live="polite">{status}</p>

  {#if reversed.length === 0}
    <p class="empty">{t('sb.notes.empty')}</p>
  {:else}
    <ul class="notes">
      {#each reversed as note (note.id)}
        <li>
          <time class="time">{formatClock(note.at)}</time>
          <span class="note-text">{loc(note.text)}</span>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .note-panel {
    display: grid;
    gap: 0.5rem;
  }
  h3 {
    margin: 0;
    font-size: 0.9rem;
    color: var(--muted, #a3a8b3);
    font-weight: 600;
  }
  .notable,
  .notes {
    display: grid;
    gap: 0.35rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .notable li {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    justify-content: space-between;
  }
  .notable-text {
    line-height: 1.5;
  }
  .free {
    display: grid;
    gap: 0.35rem;
  }
  label {
    font-size: 0.85rem;
    color: var(--muted, #a3a8b3);
  }
  textarea {
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    padding: 0.4rem 0.5rem;
    border: 1px solid var(--border, #3a3f4b);
    border-radius: 5px;
    background: var(--panel-2, #222731);
    color: var(--text, #e8e6e1);
    font: inherit;
  }
  button {
    justify-self: start;
    padding: 0.35rem 0.7rem;
    border: 1px solid var(--border, #3a3f4b);
    border-radius: 5px;
    background: var(--panel-2, #222731);
    color: var(--text, #e8e6e1);
    font: inherit;
    font-size: 0.85rem;
    cursor: pointer;
  }
  button:hover:not(:disabled) {
    border-color: var(--accent, #d8b26a);
  }
  button:focus-visible,
  textarea:focus-visible {
    outline: 2px solid var(--focus, #8ab4f8);
    outline-offset: 2px;
  }
  button:disabled {
    opacity: 0.55;
    cursor: default;
  }
  .hint,
  .status,
  .empty {
    margin: 0;
    color: var(--muted, #a3a8b3);
    font-size: 0.8rem;
  }
  .status {
    min-height: 1em;
  }
  .notes li {
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
    padding: 0.3rem 0.4rem;
    border: 1px solid var(--border, #3a3f4b);
    border-radius: 5px;
  }
  .time {
    flex: 0 0 auto;
    color: var(--muted, #a3a8b3);
    font-variant-numeric: tabular-nums;
    font-size: 0.8rem;
  }
  .note-text {
    line-height: 1.5;
  }
</style>
