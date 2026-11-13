<script lang="ts">
  import { tick } from 'svelte';
  // S05 本編: 上部バー、状況、選択肢、世間の声、記録
  // 演出キュー（audio.runCues() と runFxCues()）と字幕は App.svelte で一元処理する
  import { onMount } from 'svelte';
  import type { Localized } from '../../engine/types';
  import { addNote, choose, currentPoint, decisionSeconds, startPress, timeoutChoice } from '../../engine';
  import { audio } from '../../audio';
  import { t, loc, notice, setLang } from '../../i18n';
  import { saveProgress } from '../../storage';
  import { applyStep, errorMessage, play, resetCaptions, scenario, screen, settings } from '../store';
  import { portrait } from '../illustrations';
  import { choiceIndexFromKey, nextFreeNoteId, voiceViews } from '../parts/logic';
  import { orderChoices } from '../parts/shuffle';
  import TopBar from '../parts/TopBar.svelte';
  import Typewriter from '../parts/Typewriter.svelte';
  import ChoiceList from '../parts/ChoiceList.svelte';
  import VoiceList from '../parts/VoiceList.svelte';
  import NotePanel from '../parts/NotePanel.svelte';

  let busy = $state(false);
  let tab = $state<'voices' | 'notes'>('voices');
  /** 本番モード（#10）: 判断ごとの残り時間と、時間切れで先送りしたことの表示 */
  const TIMER_WARN_SECONDS = 10;
  let remaining = $state(0);
  let timerTotal = $state(0);
  let lastTimeout = $state('');
  let timerKey = '';
  let timerRunning = false;
  let timeoutFired = false;
  let lastTick: number | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const point = $derived($play && $scenario ? currentPoint($play, $scenario) : null);
  const draftPending = $derived(Boolean($play?.pendingDraft));
  const hardMode = $derived($play?.mode === 'hard');
  const secondsLeft = $derived(Math.max(0, Math.ceil(remaining)));
  const timerPercent = $derived(
    timerTotal > 0 ? Math.max(0, Math.min(100, (remaining / timerTotal) * 100)) : 0,
  );
  const voices = $derived($play && $scenario ? voiceViews($play, $scenario) : []);
  // 表示だけ並べ替える。選んだときは元の id をそのまま渡す（エンジンは変えない）
  const orderedChoices = $derived(
    point && $play ? orderChoices(point.choices, $play.startedAt, point.id) : [],
  );
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

  // 自分のロールの人物画。画像は飾りなので、無くても進行に影響しない
  const portraitView = $derived.by(() => {
    setLang($settings.lang);
    const state = $play;
    if (!state) return null;
    return {
      src: portrait(state.scenarioId, state.role),
      alt: t(`sa.roles.role.${state.role}`),
    };
  });

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

  $effect(() => {
    // 本番モード: 判断が変わるたびに制限時間を数え直す（時間は画面側だけで扱う）
    const state = $play;
    const current = point;
    const scale = $settings.pressTimeScale;
    if (!state || !current || state.mode !== 'hard' || draftPending) {
      timerRunning = false;
      return;
    }
    const key = `${state.startedAt}:${current.id}:${scale}`;
    if (key === timerKey) return;
    timerKey = key;
    timerTotal = decisionSeconds(scale);
    remaining = timerTotal;
    timeoutFired = false;
    lastTick = null;
    timerRunning = true;
  });

  onMount(() => {
    const handleVisibility = (): void => {
      // 背面に回っている間は数えない（記者会見と同じ扱い）
      lastTick = null;
    };
    document.addEventListener('visibilitychange', handleVisibility);
    intervalId = setInterval(countDown, 200);
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
      const index = choiceIndexFromKey(event.key, orderedChoices.length);
      if (index === null) return;
      const choice = orderedChoices[index];
      if (!choice) return;
      event.preventDefault();
      select(choice.id);
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      if (intervalId !== null) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('keydown', handleKey);
    };
  });

  /** 残り時間を数える。0 になったら「判断の先送り」として最も消極的な選択で進む */
  function countDown(): void {
    if (!timerRunning || busy || abortOpen) return;
    if (document.hidden) {
      lastTick = null;
      return;
    }
    const now = performance.now();
    if (lastTick === null) {
      lastTick = now;
      return;
    }
    const delta = (now - lastTick) / 1000;
    lastTick = now;
    if (!Number.isFinite(delta) || delta <= 0) return;
    remaining = Math.max(0, remaining - delta);
    if (remaining > 0 || timeoutFired) return;
    timeoutFired = true;
    timerRunning = false;
    fireTimeout();
  }

  function fireTimeout(): void {
    const state = $play;
    const currentPointView = point;
    if (!state || !currentPointView || busy) return;
    const choice = timeoutChoice(currentPointView);
    if (!choice) return;
    lastTimeout = t('sb.main.timer.timeoutResult', { choice: loc(choice.text) });
    applyChoice(choice.id);
  }

  /** 選んだ後は次の「状況」の先頭まで画面を戻す（下の選択肢に居続けないように） */
  async function scrollToSituation(): Promise<void> {
    await tick();
    const target = document.getElementById('situation-heading');
    if (!target) return;
    (target.closest('.situation') ?? target).scrollIntoView({ behavior: $settings.reduceMotion ? 'auto' : 'smooth', block: 'start' });
    target.focus({ preventScroll: true });
  }

  function select(choiceId: string): void {
    lastTimeout = '';
    applyChoice(choiceId);
  }

  function applyChoice(choiceId: string): void {
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
      void scrollToSituation();
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
    <div class="game-bar__top">
      {#if portraitView?.src}
        <img
          class="game-bar__portrait"
          src={portraitView.src}
          alt={portraitView.alt}
          width="480"
          height="480"
          loading="lazy"
          decoding="async"
          onerror={(event) => {
            (event.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      {/if}
      <div class="game-bar__actions">
        <button type="button" class="abort" onclick={() => (abortOpen = true)}>
          {t('sb.main.abort.button')}
        </button>
      </div>
    </div>
    {#if $play && $scenario}
      <TopBar play={$play} scenario={$scenario} />
    {/if}
  </div>

  {#if hardMode && point && !draftPending}
    <section class="timer-panel" aria-labelledby="timer-heading" data-hard-timer>
      <div class="timer-row">
        <h2 id="timer-heading">{t('sb.main.timer.heading')}</h2>
        <p class="timer" class:is-danger={secondsLeft <= TIMER_WARN_SECONDS} role="timer">
          {t('sb.main.timer.remaining', { seconds: secondsLeft })}
        </p>
      </div>
      {#if !$settings.reduceMotion}
        <div class="timer-bar" aria-hidden="true">
          <span class:is-danger={secondsLeft <= TIMER_WARN_SECONDS} style={`width: ${timerPercent}%`}></span>
        </div>
      {/if}
      {#if $settings.pressTimeScale !== 1}
        <p class="hint">{t('sb.main.timer.scale', { scale: $settings.pressTimeScale })}</p>
      {/if}
      <p class="hint">{t('sb.main.timer.hint')}</p>
    </section>
  {/if}

  {#if lastTimeout}
    <p class="timer-timeout" role="status">{lastTimeout}</p>
  {/if}

  <div class="body">
    <!-- 並び: 状況 → 世間の声 → 選択肢（状況を読み、世間の声を見てから選ぶ） -->
    <section class="situation" aria-labelledby="situation-heading">
      <h2 id="situation-heading" tabindex="-1">{t('sb.situation.heading')}</h2>
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

    <aside class="side" aria-label={t('sb.main.side')}>
      {#if !hardMode}
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
      {/if}

      <section
        id="panel-voices"
        class="panel panel--voices"
        class:active={hardMode || tab === 'voices'}
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

      {#if !hardMode}
        <section
          id="panel-notes"
          class="panel panel--notes"
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
      {/if}
    </aside>

    <div class="primary-col">
      <section class="choices" aria-labelledby="choices-heading">
        <h2 id="choices-heading">{t('sb.choices.heading')}</h2>
        {#if draftPending}
          <p class="draft-pending">{t('sb.main.draftPending')}</p>
          <button type="button" class="resume" onclick={() => screen.set('S06')}>
            {t('sb.draft.resume')}
          </button>
        {:else if point}
          <ChoiceList
            choices={orderedChoices}
            stamina={$play?.gauges.stamina ?? 100}
            disabled={busy}
            onselect={select}
          />
        {:else}
          <p class="empty">{t('sb.main.noChoices')}</p>
        {/if}
      </section>
    </div>
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
    gap: 0.8rem;
    align-items: start;
  }
  .situation {
    scroll-margin-top: 0.8rem;
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
  .game-bar__top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .game-bar__portrait {
    display: block;
    flex: 0 0 auto;
    width: 40px;
    height: 40px;
    border: 1px solid var(--line-strong);
    border-radius: 50%;
    background: var(--panel);
    object-fit: cover;
  }
  .game-bar__actions {
    display: flex;
    justify-content: flex-end;
  }
  .timer-panel {
    display: grid;
    gap: 0.35rem;
    padding: 0.6rem 0.8rem;
    border: 1px solid var(--line-strong);
    border-left: 4px solid var(--warn);
    border-radius: 8px;
    background: var(--panel);
  }
  .timer-row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.4rem;
  }
  .timer-row h2 {
    margin: 0;
    color: var(--muted);
    font-size: 0.85rem;
    font-weight: 600;
  }
  .timer {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .timer.is-danger {
    color: var(--danger);
  }
  .timer-bar {
    height: 6px;
    overflow: hidden;
    border-radius: 3px;
    background: var(--panel-hover);
  }
  .timer-bar span {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width 0.2s linear;
  }
  .timer-bar span.is-danger {
    background: var(--danger);
  }
  .timer-panel .hint {
    margin: 0;
    color: var(--muted);
    font-size: 0.8rem;
    line-height: 1.6;
  }
  .timer-timeout {
    margin: 0;
    padding: 0.45rem 0.7rem;
    border: 1px solid var(--line-strong);
    border-left: 4px solid var(--warn);
    border-radius: 6px;
    background: var(--card-notice);
    font-size: 0.9rem;
    line-height: 1.7;
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
  /* 判断の問題文は色で見分けられるようにする（見出しの文字も残す） */
  section.situation {
    border-left: 4px solid var(--card-question-line);
    background: var(--card-question);
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
  /* PC では声を広く、記録を狭く横に並べて問題文の上に置く */
  @media (min-width: 640px) {
    .side {
      grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
      align-items: start;
    }
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
    border-left: 4px solid var(--card-notice-line);
    border-radius: 5px;
    background: var(--card-notice);
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
