<script lang="ts">
  // S05 本編: 上部バー、状況、選択肢、世間の声、記録
  // 演出キュー（audio.runCues() と runFxCues()）と字幕は App.svelte で一元処理する
  import { onMount } from 'svelte';
  import type { Localized } from '../../engine/types';
  import { addNote, choose, currentPoint, startPress } from '../../engine';
  import { audio } from '../../audio';
  import { t, loc, notice } from '../../i18n';
  import { saveProgress } from '../../storage';
  import { applyStep, errorMessage, play, resetCaptions, scenario, screen, settings } from '../store';
  import { choiceIndexFromKey, nextFreeNoteId, voiceViews } from '../parts/logic';
  import TopBar from '../parts/TopBar.svelte';
  import Typewriter from '../parts/Typewriter.svelte';
  import ChoiceList from '../parts/ChoiceList.svelte';
  import VoiceList from '../parts/VoiceList.svelte';
  import NotePanel from '../parts/NotePanel.svelte';

  let busy = $state(false);
  let tab = $state<'voices' | 'notes'>('voices');

  const point = $derived($play && $scenario ? currentPoint($play, $scenario) : null);
  const draftPending = $derived(Boolean($play?.pendingDraft));
  const voices = $derived($play && $scenario ? voiceViews($play, $scenario) : []);
  const illustration = $derived(
    point?.illustration && $scenario
      ? ($scenario.illustrations ?? []).find((i) => i.id === point?.illustration)
      : undefined,
  );
  const addedNotableIds = $derived(
    point?.notable && $play
      ? point.notable
        .filter((n) => $play!.notes.some((note) => note.id === n.id))
        .map((n) => n.id)
      : [],
  );
  const hasAttackerVoice = $derived(voices.some((voice) => voice.media === 'attacker'));

  let noteStatus = $state('');
  let voicesNoticeOpen = $state(false);
  let abortOpen = $state(false);
  let cancelButton: HTMLButtonElement | null = $state(null);
  let lastPointId = '';
  const noticeKeys = new Set<string>();

  $effect(() => {
    // 中断の確認は、まず「プレイを続ける」に焦点を置く（誤って中断しないようにする）
    if (abortOpen) cancelButton?.focus();
  });

  $effect(() => {
    audio.setVolumes({ bgm: $settings.bgmVolume, se: $settings.seVolume, muted: $settings.muted });
  });

  $effect(() => {
    const state = $play;
    if (state) audio.updateFlame(state.gauges.flame);
  });

  $effect(() => {
    // 判断が変わったら、前の記録メッセージを消す
    const id = point?.id ?? '';
    if (id !== lastPointId) {
      lastPointId = id;
      noteStatus = '';
    }
  });

  $effect(() => {
    const state = $play;
    if (!state || state.voicesShown.length === 0) return;
    const key = `${state.scenarioId}:${state.role}:${state.startedAt}`;
    if (noticeKeys.has(key)) return;
    noticeKeys.add(key);
    voicesNoticeOpen = true;
  });

  onMount(() => {
    const handleKey = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (abortOpen) {
        // 確認中は選択肢を選ばせない
        if (event.key === 'Escape') {
          event.preventDefault();
          abortOpen = false;
        }
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'
        || target.tagName === 'SELECT' || target.isContentEditable)) return;
      if (!point || draftPending || busy) return;
      const index = choiceIndexFromKey(event.key, point.choices.length);
      if (index === null) return;
      const choice = point.choices[index];
      if (!choice) return;
      event.preventDefault();
      select(choice.id);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });

  function select(choiceId: string): void {
    const state = $play;
    const current = $scenario;
    if (!state || !current || busy) return;
    busy = true;
    try {
      let result = choose(state, current, choiceId);
      // 記者会見へ行く前に、質問の準備を済ませる
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

  function addNotable(item: { id: string; text: Localized }): void {
    const state = $play;
    if (!state) return;
    // 会見の requiresNote と照合するため、シナリオの id をそのまま記録IDにする
    if (state.notes.some((note) => note.id === item.id)) return;
    const next = addNote(state, { id: item.id, text: item.text, at: state.clock });
    play.set(next);
    saveProgress(next);
    noteStatus = t('sb.notes.addedAnnounce', { count: next.notes.length });
  }

  function addFree(text: string): void {
    const state = $play;
    if (!state) return;
    const id = nextFreeNoteId(state.notes);
    const next = addNote(state, { id, text, at: state.clock });
    play.set(next);
    saveProgress(next);
    noteStatus = t('sb.notes.addedAnnounce', { count: next.notes.length });
  }

  /**
   * 進行は保存したままタイトルへ戻る（行き止まりにしない）。
   * 保存済みの状態は残すので、タイトルの「続きから」で再開できる。
   */
  function abortToTitle(): void {
    const state = $play;
    if (state && !state.finished) saveProgress(state);
    resetCaptions();
    abortOpen = false;
    play.set(null);
    audio.playBgm('title');
    screen.set('S01');
  }
</script>

<section class="main" data-screen="S05Main">
  <h1 class="sr-only">{t('sb.main.title')}</h1>

  <div class="game-bar">
    <div class="game-bar__actions">
      <button type="button" class="abort" onclick={() => (abortOpen = true)}>
        {t('sb.main.abort.button')}
      </button>
    </div>
    {#if $play && $scenario}
      <TopBar play={$play} scenario={$scenario} />
    {/if}
  </div>

  <div class="body">
    <div class="primary-col">
      <section class="situation" aria-labelledby="situation-heading">
        <h2 id="situation-heading">{t('sb.situation.heading')}</h2>
        {#if point}
          <Typewriter text={loc(point.text)} instant={$settings.reduceMotion} />
        {:else}
          <p>{t('sb.main.noPoint')}</p>
        {/if}
        {#if illustration}
          <figure>
            <img src={illustration.file} alt={loc(illustration.alt)} />
            <figcaption>{loc(illustration.credit)}</figcaption>
          </figure>
        {/if}
      </section>

      <section class="choices" aria-labelledby="choices-heading">
        <h2 id="choices-heading">{t('sb.choices.heading')}</h2>
        {#if draftPending}
          <p class="draft-pending">{t('sb.main.draftPending')}</p>
          <button type="button" class="resume" onclick={() => screen.set('S06')}>
            {t('sb.draft.resume')}
          </button>
        {:else if point}
          <ChoiceList
            choices={point.choices}
            stamina={$play?.gauges.stamina ?? 100}
            disabled={busy}
            onselect={select}
          />
        {:else}
          <p class="empty">{t('sb.main.noChoices')}</p>
        {/if}
      </section>
    </div>

    <aside class="side" aria-label={t('sb.main.side')}>
      <div class="tabs" role="tablist" aria-label={t('sb.main.side')}>
        <button
          id="tab-voices"
          type="button"
          role="tab"
          aria-selected={tab === 'voices'}
          aria-controls="panel-voices"
          class:active={tab === 'voices'}
          onclick={() => (tab = 'voices')}
        >{t('sb.voices.heading')}</button>
        <button
          id="tab-notes"
          type="button"
          role="tab"
          aria-selected={tab === 'notes'}
          aria-controls="panel-notes"
          class:active={tab === 'notes'}
          onclick={() => (tab = 'notes')}
        >{t('sb.notes.heading')}</button>
      </div>

      <section
        id="panel-voices"
        class="panel"
        class:active={tab === 'voices'}
        aria-labelledby="tab-voices"
      >
        <h2>{t('sb.voices.heading')}</h2>
        {#if voicesNoticeOpen}
          <div class="notice" role="note">
            <p>{notice('voices')}</p>
            <button type="button" onclick={() => (voicesNoticeOpen = false)}>{t('sb.notice.close')}</button>
          </div>
        {/if}
        {#if hasAttackerVoice}
          <div class="notice notice--criminal" role="note">
            <p>{notice('criminal')}</p>
          </div>
        {/if}
        <VoiceList {voices} />
      </section>

      <section
        id="panel-notes"
        class="panel"
        class:active={tab === 'notes'}
        aria-labelledby="tab-notes"
      >
        <h2>{t('sb.notes.heading')}</h2>
        <NotePanel
          notable={point?.notable ?? []}
          notes={$play?.notes ?? []}
          addedIds={addedNotableIds}
          status={noteStatus}
          onaddnotable={addNotable}
          onaddfree={addFree}
        />
      </section>
    </aside>
  </div>

  {#if abortOpen}
    <div class="abort-overlay">
      <div
        class="abort-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="abort-title"
        aria-describedby="abort-message"
      >
        <h2 id="abort-title">{t('sb.main.abort.heading')}</h2>
        <p id="abort-message">{t('sb.main.abort.message')}</p>
        <div class="abort-actions">
          <button
            type="button"
            class="abort-cancel"
            bind:this={cancelButton}
            onclick={() => (abortOpen = false)}
          >{t('sb.main.abort.cancel')}</button>
          <button type="button" class="abort-confirm" onclick={abortToTitle}>
            {t('sb.main.abort.confirm')}
          </button>
        </div>
      </div>
    </div>
  {/if}
</section>

<style>
  .main {
    display: grid;
    gap: 0.7rem;
    max-width: 72rem;
    margin: 0 auto;
    padding: 0.8rem;
    color: var(--text);
  }
  .body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 22rem;
    gap: 0.8rem;
    align-items: start;
  }
  .primary-col {
    display: grid;
    gap: 0.8rem;
    min-width: 0;
  }
  .game-bar {
    display: grid;
    gap: 0.3rem;
  }
  .game-bar__actions {
    display: flex;
    justify-content: flex-end;
  }
  .abort {
    padding: 0.3rem 0.7rem;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .abort:hover {
    border-color: var(--danger);
    color: var(--danger);
  }
  .abort:focus-visible,
  .abort-cancel:focus-visible,
  .abort-confirm:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
  .abort-overlay {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: grid;
    place-items: center;
    padding: 1rem;
    background: var(--overlay);
  }
  .abort-dialog {
    width: min(28rem, 100%);
    padding: 1rem 1.1rem;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--panel);
    color: var(--text);
  }
  .abort-dialog h2 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
  }
  .abort-dialog p {
    margin: 0 0 0.9rem;
    color: var(--muted);
    font-size: 0.9rem;
    line-height: 1.7;
  }
  .abort-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
  .abort-cancel,
  .abort-confirm {
    padding: 0.45rem 0.9rem;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--panel-hover);
    color: var(--text);
    font: inherit;
    font-size: 0.88rem;
    cursor: pointer;
  }
  .abort-confirm {
    border-color: var(--danger);
    color: var(--danger);
  }
  section.situation,
  section.choices,
  .panel {
    padding: 0.8rem;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    background: var(--panel);
  }
  h2 {
    margin: 0 0 0.5rem;
    font-size: 0.9rem;
    color: var(--muted);
    font-weight: 600;
  }
  .situation :global(.typed) {
    font-size: 1.05rem;
  }
  figure {
    margin: 0.6rem 0 0;
  }
  figure img {
    max-width: 100%;
    height: auto;
    border-radius: 6px;
  }
  figcaption {
    color: var(--muted);
    font-size: 0.75rem;
  }
  .side {
    display: grid;
    gap: 0.6rem;
    min-width: 0;
  }
  .tabs {
    display: none;
    gap: 0.35rem;
  }
  .tabs button {
    flex: 1;
    padding: 0.45rem;
    border: 1px solid var(--line-strong);
    border-radius: 5px;
    background: var(--panel-hover);
    color: var(--muted);
    font: inherit;
    cursor: pointer;
  }
  .tabs button.active {
    border-color: var(--accent);
    color: var(--text);
  }
  .tabs button:focus-visible,
  .resume:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
  .panel h2 {
    margin-bottom: 0.5rem;
  }
  .notice {
    margin-bottom: 0.5rem;
    padding: 0.5rem 0.6rem;
    border: 1px solid var(--line-strong);
    border-left: 3px solid var(--accent);
    border-radius: 5px;
    background: var(--panel-hover);
    font-size: 0.85rem;
  }
  .notice p {
    margin: 0 0 0.35rem;
    line-height: 1.6;
  }
  .notice--criminal {
    border-left-color: var(--danger);
  }
  .notice button {
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .resume {
    padding: 0.55rem 0.9rem;
    border: 1px solid var(--accent);
    border-radius: 6px;
    background: var(--panel-hover);
    color: var(--text);
    font: inherit;
    cursor: pointer;
  }
  .draft-pending,
  .empty {
    margin: 0 0 0.5rem;
    color: var(--muted);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }
  /* スマートフォン: 世間の声と記録をタブで切り替える */
  @media (max-width: 639px) {
    .body {
      grid-template-columns: 1fr;
    }
    .tabs {
      display: flex;
    }
    .panel {
      display: none;
    }
    .panel.active {
      display: block;
    }
  }
</style>
