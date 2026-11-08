<script lang="ts">
  // S06 文案作成: 部品を選んで文を組み立て、確定する
  import type { Draft } from '../../engine/types';
  import { startPress, submitDraft } from '../../engine';
  import { audio } from '../../audio';
  import { t, loc } from '../../i18n';
  import { saveProgress } from '../../storage';
  import { applyStep, errorMessage, play, scenario, screen, settings } from '../store';
  import { composeDraft, draftComplete, draftFor, initialSelections } from '../parts/logic';
  import DraftSlots from '../parts/DraftSlots.svelte';
  import Typewriter from '../parts/Typewriter.svelte';

  let selections = $state<Record<string, string>>({});
  let busy = $state(false);
  let initialized = false;

  const draft = $derived($play && $scenario ? draftFor($play, $scenario) : null);
  const complete = $derived(draft ? draftComplete(draft, selections) : false);
  const picked = $derived(draft ? draft.slots.filter((slot) => selections[slot.id] !== undefined).length : 0);
  const composed = $derived(
    draft
      ? composeDraft(draft, selections, loc, {
        separator: t('sb.draft.separator'),
        autoText: t('sb.draft.autoValue'),
      })
      : '',
  );

  $effect(() => {
    const current = draft;
    const state = $play;
    const scenarioValue = $scenario;
    if (initialized || !current || !state || !scenarioValue) return;
    selections = initialSelections(current, state, scenarioValue);
    initialized = true;
  });

  function selectSlot(slotId: string, itemId: string): void {
    selections = { ...selections, [slotId]: itemId };
    audio.playSe('typing');
  }

  function confirm(): void {
    const state = $play;
    const current = $scenario;
    const currentDraft: Draft | null = draft;
    if (!state || !current || !currentDraft || !complete || busy) return;
    busy = true;
    try {
      let result = submitDraft(state, current, selections);
      // 文案の確定で判断を使い切った場合も、記者会見の準備をしてから進む
      if (result.next === 'press') {
        const started = startPress(result.state, current);
        result = { state: started.state, cues: [...result.cues, ...started.cues], next: started.next };
      }
      saveProgress(result.state);
      applyStep(result);
    } catch (error) {
      errorMessage.set(error instanceof Error ? error.message : String(error));
      screen.set('error');
    } finally {
      busy = false;
    }
  }
</script>

<section class="draft" data-screen="S06Draft">
  <h1>{t('sb.draft.heading')}</h1>

  {#if draft}
    <p class="title">{loc(draft.title)}</p>
    <p class="progress">{t('sb.draft.progress', { done: picked, total: draft.slots.length })}</p>

    <DraftSlots {draft} {selections} onselect={selectSlot} />

    <section class="composed" aria-labelledby="composed-heading">
      <h2 id="composed-heading">{t('sb.draft.composed')}</h2>
      {#if composed}
        <Typewriter text={composed} instant={$settings.reduceMotion} />
      {:else}
        <p class="empty">{t('sb.draft.composedEmpty')}</p>
      {/if}
    </section>

    <div class="actions">
      <button type="button" class="back" onclick={() => screen.set('S05')}>{t('sb.draft.back')}</button>
      <button type="button" class="confirm" disabled={!complete || busy} onclick={confirm}>
        {t('sb.draft.confirm')}
      </button>
    </div>
    <p class="status" aria-live="polite">
      {complete ? t('sb.draft.ready') : t('sb.draft.required')}
    </p>
  {:else}
    <p class="empty">{t('sb.draft.missing')}</p>
    <button type="button" class="back" onclick={() => screen.set('S05')}>{t('sb.draft.back')}</button>
  {/if}
</section>

<style>
  .draft {
    display: grid;
    gap: 0.7rem;
    max-width: 48rem;
    margin: 0 auto;
    padding: 0.8rem;
    color: var(--text);
  }
  h1 {
    margin: 0;
    font-size: 1.15rem;
  }
  h2 {
    margin: 0 0 0.4rem;
    font-size: 0.9rem;
    color: var(--muted);
    font-weight: 600;
  }
  .title {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 700;
  }
  .progress,
  .status,
  .empty {
    margin: 0;
    color: var(--muted);
    font-size: 0.85rem;
  }
  .composed {
    padding: 0.8rem;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    background: var(--panel);
  }
  .composed :global(.typed) {
    line-height: 1.8;
  }
  .actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }
  button {
    padding: 0.5rem 0.9rem;
    border: 1px solid var(--line-strong);
    border-radius: 6px;
    background: var(--panel-hover);
    color: var(--text);
    font: inherit;
    cursor: pointer;
  }
  button:hover:not(:disabled) {
    border-color: var(--accent);
  }
  button:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
  button:disabled {
    opacity: 0.55;
    cursor: default;
  }
  .confirm {
    border-color: var(--accent);
  }
  @media (max-width: 639px) {
    .actions {
      flex-direction: column-reverse;
    }
    .actions button {
      width: 100%;
    }
  }
</style>
