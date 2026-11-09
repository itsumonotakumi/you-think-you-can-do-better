<script lang="ts">
  import type { PlayState } from '../../engine/types';
  import { audio } from '../../audio';
  import { notice, setLang, t, loc } from '../../i18n';
  import { savePrologue, saveProgress } from '../../storage';
  import { keyVisual } from '../illustrations';
  import { play, scenario, screen, settings } from '../store';
  import '../styles/base.css';

  let comment = $state($play?.prologue.comment ?? '');
  let hours = $state(
    $play?.prologue.predictedHours === null || $play?.prologue.predictedHours === undefined
      ? ''
      : String($play.prologue.predictedHours),
  );
  let error = $state('');

  const ui = $derived.by(() => {
    setLang($settings.lang);
    return {
      title: t('sa.prologue.title'),
      lead: t('sa.prologue.lead'),
      explain: t('sa.prologue.explain'),
      prompt: t('sa.prologue.prompt'),
      placeholder: t('sa.prologue.placeholder'),
      counter: (n: number) => t('sa.prologue.counter', { n }),
      hours: t('sa.prologue.hours'),
      hoursUnit: t('sa.prologue.hoursUnit'),
      hoursHint: t('sa.prologue.hoursHint'),
      hoursInvalid: t('sa.prologue.hoursInvalid'),
      begin: t('sa.prologue.begin'),
      skip: t('sa.prologue.skip'),
      back: t('sa.common.back'),
      home: t('sa.error.home'),
      optional: t('sa.common.optional'),
      noPlay: t('sa.prologue.noPlay'),
      fiction: notice('fiction'),
      criminal: notice('criminal'),
      keySrc: $scenario ? keyVisual($scenario.id) : null,
      keyAlt: $scenario ? t('sa.images.key', { title: loc($scenario.title) }) : '',
    };
  });

  $effect(() => {
    audio.playBgm('prologue');
  });

  function onInput(): void {
    audio.playSe('typing');
  }

  function back(): void {
    screen.set('S04');
  }

  /** 入力の有無にかかわらず開始する。保存と画面遷移をここにまとめる */
  function startWith(prologue: PlayState['prologue']): void {
    const current = $play;
    if (!current) {
      screen.set('S01');
      return;
    }
    const next = { ...current, prologue };
    play.set(next);
    savePrologue(prologue);
    saveProgress(next);
    error = '';
    screen.set('S05');
  }

  function begin(): void {
    const current = $play;
    if (!current) {
      screen.set('S01');
      return;
    }

    let predicted: number | null = null;
    const raw = hours.trim();
    if (raw !== '') {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0 || n > 720) {
        error = ui.hoursInvalid;
        return;
      }
      predicted = n;
    }

    startWith({ comment: comment.slice(0, 200), predictedHours: predicted });
  }

  /** 入力せずに始める（コメント空・予測なし）。あとで書き直しは求めない */
  function skip(): void {
    comment = '';
    hours = '';
    startWith({ comment: '', predictedHours: null });
  }
</script>

<section class="screen screen--narrow" data-screen="S02Prologue">
  {#if ui.keySrc}
    <img
      class="prologue-key"
      src={ui.keySrc}
      alt={ui.keyAlt}
      width="1280"
      height="721"
      decoding="async"
      onerror={(event) => {
        (event.currentTarget as HTMLImageElement).style.display = 'none';
      }}
    />
  {/if}

  <header class="screen-head">
    <h1>{ui.title}</h1>
    <p class="lead">{ui.lead}</p>
  </header>

  {#if $play}
    <div class="panel stack">
      <p class="explain">{ui.explain}</p>

      <div class="field">
        <label class="field-label" for="prologue-comment">{ui.prompt}</label>
        <textarea
          id="prologue-comment"
          class="textarea"
          rows="5"
          maxlength="200"
          bind:value={comment}
          placeholder={ui.placeholder}
          oninput={onInput}
        ></textarea>
        <p class="counter" aria-live="polite">{ui.counter(comment.length)}</p>
      </div>

      <div class="field">
        <label class="field-label" for="prologue-hours">
          {ui.hours} <span class="muted small">（{ui.optional}）</span>
        </label>
        <div class="row row--tight">
          <input
            id="prologue-hours"
            class="input input--num"
            type="text"
            inputmode="numeric"
            pattern="[0-9]*"
            value={hours}
            oninput={(e) => (hours = e.currentTarget.value)}
          />
          <span class="muted">{ui.hoursUnit}</span>
        </div>
        <p class="hint">{ui.hoursHint}</p>
      </div>

      {#if error}
        <p class="error-text" role="alert">{error}</p>
      {/if}

      <div class="row row--between">
        <button class="btn btn--ghost" onclick={back}>{ui.back}</button>
        <button class="btn btn--primary" onclick={begin}>{ui.begin}</button>
      </div>

      <button class="btn btn--ghost btn--wide skip" onclick={skip}>{ui.skip}</button>
    </div>
  {:else}
    <div class="panel stack">
      <p>{ui.noPlay}</p>
      <button class="btn" onclick={() => screen.set('S01')}>{ui.home}</button>
    </div>
  {/if}

  <div class="notice-stack">
    <p class="notice">{ui.fiction}</p>
    <p class="notice">{ui.criminal}</p>
  </div>
</section>

<style>
  .explain {
    margin: 0;
    color: var(--text-soft);
    font-size: 0.95em;
    line-height: 1.8;
  }
  .skip {
    justify-content: center;
  }
  .prologue-key {
    display: block;
    width: 100%;
    height: auto;
    margin-bottom: 1.25em;
    aspect-ratio: 1280 / 721;
    object-fit: cover;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--panel-hover);
  }
</style>
