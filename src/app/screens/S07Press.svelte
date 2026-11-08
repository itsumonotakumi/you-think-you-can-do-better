<script module lang="ts">
  import type { PressQuestion } from '../../engine/types';

  export const DEFAULT_PRESS_SECONDS = 30;
  export const PRESS_WARN_SECONDS = 5;

  /** 質問の制限時間（秒）。未設定は30秒。設定で1.5倍・2倍に延ばせる */
  export function pressSeconds(question: PressQuestion, scale: number): number {
    const base = typeof question.seconds === 'number' && question.seconds > 0
      ? question.seconds
      : DEFAULT_PRESS_SECONDS;
    return Math.max(1, Math.round(base * scale));
  }

  /** 画面に出す残り秒数（0未満は0、端数は切り上げ） */
  export function displaySeconds(remaining: number): number {
    return Math.max(0, Math.ceil(remaining));
  }
</script>

<script lang="ts">
  // S07 記者会見: 1問ずつ答え、現実の時間で残り秒数を数える
  import { onMount } from 'svelte';
  import { answerPress, availableAnswers } from '../../engine';
  import { audio } from '../../audio';
  import { loc, t } from '../../i18n';
  import { saveProgress } from '../../storage';
  import { applyStep, cues, errorMessage, play, scenario, screen, settings } from '../store';
  import { runFxCues } from '../effects';
  import { claimCues } from '../parts/cueMemory';
  import { choiceIndexFromKey, formatClock } from '../parts/logic';
  import '../effects/effects.css';

  let busy = $state(false);
  let notesOpen = $state(false);
  let remaining = $state(DEFAULT_PRESS_SECONDS);
  let total = $state(DEFAULT_PRESS_SECONDS);
  let systemReduce = $state(false);

  let running = false;
  let warned = false;
  let lastTick: number | null = null;
  let timerKey = '';
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const question = $derived.by(() => {
    const state = $play;
    const current = $scenario;
    if (!state?.press || !current?.press) return null;
    const id = state.press.questionIds[state.press.index];
    if (!id) return null;
    const all = [
      ...current.press.questions,
      ...(current.press.extraQuestions ?? []).map((entry) => entry.question),
    ];
    return all.find((item) => item.id === id) ?? null;
  });

  const answers = $derived($play && $scenario ? availableAnswers($play, $scenario) : []);
  const notes = $derived($play?.notes ?? []);
  const currentIndex = $derived(($play?.press?.index ?? 0) + 1);
  const totalQuestions = $derived($play?.press?.questionIds.length ?? 0);
  const hiddenAnswers = $derived(
    question ? Math.max(0, question.answers.length - answers.length) : 0,
  );
  const percent = $derived(total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0);

  $effect(() => {
    const current = question;
    const scale = $settings.pressTimeScale;
    if (!current) return;
    const key = `${current.id}:${scale}`;
    if (key === timerKey) return;
    timerKey = key;
    total = pressSeconds(current, scale);
    remaining = total;
    warned = false;
    lastTick = document.hidden ? null : performance.now();
    running = true;
    notesOpen = false;
  });

  $effect(() => {
    audio.setVolumes({ bgm: $settings.bgmVolume, se: $settings.seVolume, muted: $settings.muted });
  });

  $effect(() => {
    const list = $cues;
    if (!list || list.length === 0) return;
    if (!claimCues(list)) return;
    audio.runCues(list);
    runFxCues(list, $settings.reduceMotion || systemReduce);
  });

  onMount(() => {
    audio.playBgm('press');

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    systemReduce = motionQuery.matches;
    const handleMotion = (event: MediaQueryListEvent): void => {
      systemReduce = event.matches;
    };
    motionQuery.addEventListener('change', handleMotion);

    const handleVisibility = (): void => {
      // 背面に回っている間は数えない。戻ったら次の tick から再開する
      lastTick = null;
    };
    document.addEventListener('visibilitychange', handleVisibility);

    const handleKey = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'
        || target.tagName === 'SELECT' || target.isContentEditable)) return;
      if (busy || answers.length === 0) return;
      const index = choiceIndexFromKey(event.key, answers.length);
      if (index === null) return;
      const answer = answers[index];
      if (!answer) return;
      event.preventDefault();
      choose(answer.id);
    };
    window.addEventListener('keydown', handleKey);

    intervalId = setInterval(tick, 200);
    return () => {
      if (intervalId !== null) clearInterval(intervalId);
      window.removeEventListener('keydown', handleKey);
      document.removeEventListener('visibilitychange', handleVisibility);
      motionQuery.removeEventListener('change', handleMotion);
    };
  });

  function tick(): void {
    if (!running || busy) return;
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
    if (!warned && remaining <= PRESS_WARN_SECONDS) {
      warned = true;
      audio.playSe('press_timer');
    }
    if (remaining <= 0) {
      running = false;
      choose(null);
    }
  }

  function choose(answerId: string | null): void {
    const state = $play;
    const current = $scenario;
    if (!state || !current || busy) return;
    busy = true;
    running = false;
    try {
      const result = answerPress(state, current, answerId, $settings.pressTimeScale);
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

<section class="screen screen--narrow press" data-screen="S07Press">
  <h1 class="sr-only">{t('sc.press.title')}</h1>

  {#if !$play || !$scenario}
    <div class="panel stack">
      <p>{t('sc.press.missing')}</p>
      <button class="btn" type="button" onclick={() => screen.set('S01')}>
        {t('sc.ending.titleButton')}
      </button>
    </div>
  {:else if question}
    <header class="press-head">
      <div>
        <p class="eyebrow">{t('sc.press.title')}</p>
        <p class="progress">
          {t('sc.press.progress', { current: currentIndex, total: totalQuestions })}
        </p>
      </div>
      <p class="count" aria-label={t('sc.playCount', { n: $play.playCount })}>
        {t('sc.playCount', { n: $play.playCount })}
      </p>
    </header>

    <section class="panel timer-panel">
      <div class="timer-row">
        <p class="timer" class:is-danger={remaining <= PRESS_WARN_SECONDS} role="timer">
          {t('sc.press.remaining', { seconds: displaySeconds(remaining) })}
        </p>
        {#if $settings.pressTimeScale !== 1}
          <p class="hint">{t('sc.press.timeScale', { scale: $settings.pressTimeScale })}</p>
        {/if}
      </div>
      <div class="timer-bar" aria-hidden="true">
        <span class:is-danger={remaining <= PRESS_WARN_SECONDS} style={`width: ${percent}%`}></span>
      </div>
      {#if remaining <= PRESS_WARN_SECONDS}
        <p class="timer-warn" role="status">{t('sc.press.fiveSeconds')}</p>
      {/if}
      <p class="hint">{t('sc.press.pausedHint')}</p>
    </section>

    <section class="panel" aria-labelledby="press-question-heading">
      <p class="sound-caption">{t('sc.press.shutter')}</p>
      <h2 id="press-question-heading">{t('sc.press.question')}</h2>
      <p class="question">{loc(question.text)}</p>

      <h3>{t('sc.press.answers')}</h3>
      <ul class="answers">
        {#each answers as answer, index (answer.id)}
          <li>
            <button
              type="button"
              class="btn btn--wide answer"
              disabled={busy}
              aria-keyshortcuts={String(index + 1)}
              onclick={() => choose(answer.id)}
            >
              <span class="answer-key" aria-hidden="true">{index + 1}</span>
              <span>{loc(answer.text)}</span>
            </button>
          </li>
        {/each}
      </ul>
      {#if hiddenAnswers > 0}
        <p class="hint">{t('sc.press.hiddenAnswers')}</p>
      {/if}
    </section>

    <section class="panel notes" aria-labelledby="press-notes-heading">
      <div class="notes-head">
        <h2 id="press-notes-heading">{t('sc.notes.heading')}</h2>
        <button
          type="button"
          class="btn btn--small"
          aria-expanded={notesOpen}
          aria-controls="press-notes"
          onclick={() => (notesOpen = !notesOpen)}
        >
          {notesOpen ? t('sc.press.notesClose') : t('sc.press.notesOpen')}
        </button>
      </div>
      <p class="hint">{t('sc.press.notesHint')}</p>
      {#if notesOpen}
        <div id="press-notes">
          {#if notes.length === 0}
            <p class="muted">{t('sc.press.notesEmpty')}</p>
          {:else}
            <ul class="note-list">
              {#each notes as note (note.id)}
                <li>
                  <span class="note-time">{formatClock(note.at)}</span>
                  <span>{loc(note.text)}</span>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/if}
    </section>
  {:else}
    <div class="panel stack">
      <p>{t('sc.press.waiting')}</p>
      <button class="btn" type="button" onclick={() => screen.set('S01')}>
        {t('sc.ending.titleButton')}
      </button>
    </div>
  {/if}
</section>

<style>
  .press {
    display: grid;
    gap: 0.8rem;
  }
  .press-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .eyebrow {
    margin: 0;
  }
  .progress,
  .count {
    margin: 0;
    color: var(--muted);
    font-size: 0.9em;
  }
  .timer-panel {
    margin: 0;
  }
  .timer-row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .timer {
    margin: 0;
    color: var(--accent-strong);
    font-size: 1.6em;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .timer.is-danger {
    color: var(--danger);
  }
  .timer-bar {
    height: 0.35rem;
    margin: 0.5rem 0;
    overflow: hidden;
    border-radius: 999px;
    background: var(--line);
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
  .timer-warn {
    margin: 0.25rem 0;
    color: var(--danger);
    font-weight: 700;
  }
  .panel {
    margin: 0;
  }
  .panel h2 {
    margin: 0 0 0.4rem;
    font-size: 0.9em;
    color: var(--muted);
    font-weight: 600;
  }
  .panel h3 {
    margin: 1rem 0 0.4rem;
    font-size: 0.9em;
    color: var(--muted);
    font-weight: 600;
  }
  .sound-caption {
    margin: 0 0 0.3rem;
    color: var(--muted);
    font-size: 0.75em;
  }
  .question {
    margin: 0;
    font-size: 1.15em;
    line-height: 1.8;
  }
  .answers {
    display: grid;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .answer {
    justify-content: flex-start;
    text-align: left;
  }
  .answer-key {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 1.6em;
    height: 1.6em;
    border: 1px solid var(--line-strong);
    border-radius: 4px;
    color: var(--muted);
    font-size: 0.8em;
  }
  .notes-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .notes-head h2 {
    margin: 0;
  }
  .note-list {
    display: grid;
    gap: 0.4rem;
    margin: 0.5rem 0 0;
    padding: 0;
    list-style: none;
  }
  .note-list li {
    display: grid;
    grid-template-columns: 4.5em minmax(0, 1fr);
    gap: 0.5rem;
    padding: 0.35rem 0;
    border-top: 1px solid var(--line);
    font-size: 0.9em;
  }
  .note-time {
    color: var(--muted);
    font-variant-numeric: tabular-nums;
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
  @media (max-width: 639px) {
    .timer {
      font-size: 1.35em;
    }
    .note-list li {
      grid-template-columns: 1fr;
      gap: 0.1rem;
    }
  }
</style>
