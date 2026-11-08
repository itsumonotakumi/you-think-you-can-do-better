<script lang="ts">
  import { audio } from '../../audio';
  import { notice, setLang, t } from '../../i18n';
  import { savePrologue, saveProgress } from '../../storage';
  import { play, screen, settings } from '../store';
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
      prompt: t('sa.prologue.prompt'),
      placeholder: t('sa.prologue.placeholder'),
      counter: (n: number) => t('sa.prologue.counter', { n }),
      hours: t('sa.prologue.hours'),
      hoursUnit: t('sa.prologue.hoursUnit'),
      hoursHint: t('sa.prologue.hoursHint'),
      hoursInvalid: t('sa.prologue.hoursInvalid'),
      begin: t('sa.prologue.begin'),
      back: t('sa.common.back'),
      home: t('sa.error.home'),
      optional: t('sa.common.optional'),
      noPlay: t('sa.prologue.noPlay'),
      fiction: notice('fiction'),
      criminal: notice('criminal'),
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

    const prologue = { comment: comment.slice(0, 200), predictedHours: predicted };
    const next = { ...current, prologue };
    play.set(next);
    savePrologue(prologue);
    saveProgress(next);
    error = '';
    screen.set('S05');
  }
</script>

<section class="screen screen--narrow" data-screen="S02Prologue">
  <header class="screen-head">
    <h1>{ui.title}</h1>
    <p class="lead">{ui.lead}</p>
  </header>

  {#if $play}
    <div class="panel stack">
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
