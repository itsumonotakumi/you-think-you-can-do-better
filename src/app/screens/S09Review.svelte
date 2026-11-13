<script module lang="ts">
  import type { Axis, MisleadingType, PlayState, Scenario } from '../../engine/types';

  /** 細目の軸の文言キー */
  export function axisLabelKey(axis: Axis): string {
    return `sc.review.axis.${axis}`;
  }

  /** 誘導の型の文言キー */
  export function typeLabelKey(type: MisleadingType): string {
    return `sc.review.type.${type}`;
  }

  /** 点数の符号付き表示 */
  export function signed(points: number): string {
    return points > 0 ? `+${points}` : String(points);
  }

  /** 最初の「通知・公表」の判断を終えた時刻までの時間（時間単位）。無ければ null */
  export function publicationHours(state: PlayState, scenario: Scenario): number | null {
    const role = scenario.roles[state.role];
    if (!role) return null;
    const history = Array.isArray(state.history) ? state.history : [];
    for (const record of history) {
      if (!record || typeof record !== 'object') continue;
      const point = role.points?.find((item) => item.id === record.pointId);
      if (!point || point.phase !== 'notify') continue;
      const choice = point.choices?.find((item) => item.id === record.choiceId);
      if (!choice) continue;
      const at = record.at;
      if (!at || typeof at.day !== 'number' || typeof at.minutes !== 'number') continue;
      const minutes = (at.day - scenario.start.day) * 1440
        + (at.minutes - scenario.start.minutes) + choice.minutes;
      return Math.max(0, minutes) / 60;
    }
    return null;
  }
</script>

<script lang="ts">
  import { mediaLabelKey } from '../parts/logic';
  // S09 振り返り: 各判断・細目・根拠・誘導の声をまとめて出す
  import { onMount } from 'svelte';
  import { buildReport } from '../../engine';
  import type {
    Choice, ChoiceStatsResponse, DecisionPoint, Media, PressQuestion, Reference, Voice,
  } from '../../engine/types';
  import { audio } from '../../audio';
  import { loadReferences } from '../../data/loader';
  import { loc, notice, t } from '../../i18n';
  import { play, scenario, screen, settings } from '../store';
  import { isDebug } from '../debug';
  import {
    bestChoiceOf, draftReviews, hasLocalized, isBestChoice,
  } from '../parts/review';
  import {
    formatClock, mediaGlyph, minutesBetween,
  } from '../parts/logic';
  import { choicePercent, fetchChoiceStats, isRankingEnabled, RANKING_KEYS } from '../ranking';

  let refs = $state<Record<string, Reference>>({});
  let refsLoading = $state(true);
  let refsError = $state(false);
  let stats = $state<ChoiceStatsResponse | null>(null);

  const role = $derived($play && $scenario ? $scenario.roles[$play.role] : undefined);
  // 保存が壊れていても振り返り画面を落とさない（組めなければ「データなし」表示へ）
  const report = $derived.by(() => {
    if (!$play || !$scenario) return null;
    try {
      return buildReport($play, $scenario);
    } catch {
      return null;
    }
  });
  const prologue = $derived($play?.prologue ?? null);
  const prologueComment = $derived(typeof prologue?.comment === 'string' ? prologue.comment : '');
  const publishedHours = $derived($play && $scenario ? publicationHours($play, $scenario) : null);
  const elapsedHours = $derived(
    $play && $scenario ? Math.max(0, minutesBetween($scenario.start, $play.clock)) / 60 : 0,
  );
  const shownHours = $derived(publishedHours ?? elapsedHours);
  // 細目は通常隠す。?debug=1 または #debug のときだけ出す
  const debug = isDebug();

  const pointsById = $derived(new Map(
    (role?.points ?? []).map((point) => [point.id, point] as const),
  ));
  const choicesById = $derived(new Map(
    (role?.points ?? []).flatMap((point) => point.choices.map((choice) => [choice.id, choice] as const)),
  ));
  const voicesById = $derived(new Map(
    (role?.voices ?? []).map((voice) => [voice.id, voice] as const),
  ));
  const questionsById = $derived(new Map([
    ...($scenario?.press?.questions ?? []),
    ...(($scenario?.press?.extraQuestions ?? []).map((entry) => entry.question)),
  ].map((question) => [question.id, question] as const)));
  const draftGroups = $derived(
    report && role ? draftReviews(role, report.itemsEarned.map((item) => item.id)) : [],
  );

  $effect(() => {
    audio.setVolumes({ bgm: $settings.bgmVolume, se: $settings.seVolume, muted: $settings.muted });
  });

  onMount(() => {
    audio.playBgm('calm');
    const state = $play;
    const current = $scenario;
    let cancelled = false;

    // 選択率は振り返りだけで出す。取れなくても画面は止めない
    if (isRankingEnabled() && state && current) {
      void fetchChoiceStats({
        scenarioId: state.scenarioId,
        role: state.role,
        mode: state.mode ?? 'normal',
      }).then((response) => {
        if (!cancelled) stats = response;
      });
    }

    loadReferences()
      .then((list) => {
        if (cancelled) return;
        const map: Record<string, Reference> = {};
        for (const ref of list) {
          // JSON のキーをそのまま代入しない（プロトタイプ汚染を防ぐ）
          if (ref.id === '__proto__' || ref.id === 'constructor' || ref.id === 'prototype') continue;
          map[ref.id] = ref;
        }
        refs = map;
      })
      .catch(() => {
        if (!cancelled) refsError = true;
      })
      .finally(() => {
        if (!cancelled) refsLoading = false;
      });
    return () => {
      cancelled = true;
    };
  });

  function refOf(id: string): Reference | null {
    return Object.hasOwn(refs, id) ? refs[id] ?? null : null;
  }

  function pointOf(id: string): DecisionPoint | null {
    return pointsById.get(id) ?? null;
  }

  function choiceOf(id: string): Choice | null {
    return choicesById.get(id) ?? null;
  }

  function voiceOf(id: string): Voice | null {
    return voicesById.get(id) ?? null;
  }

  function questionOf(id: string): PressQuestion | null {
    return questionsById.get(id) ?? null;
  }

  function answerText(question: PressQuestion | null, answerId: string): string {
    const answer = question?.answers.find((item) => item.id === answerId);
    return answer ? loc(answer.text) : answerId;
  }

  function mediaKey(media: Media): string {
    return mediaLabelKey(media, $play?.role, 'sc');
  }

  function hoursText(hours: number): string {
    return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  }
</script>

<section class="screen review" data-screen="S09Review" data-debug={debug ? 'on' : 'off'}>
  <header class="review-head">
    <p class="eyebrow">{t('sc.review.title')}</p>
    <h1>{t('sc.review.title')}</h1>
    {#if report}
      <p class="play-count">{t('sc.playCount', { n: report.playCount })}</p>
    {/if}
    {#if debug}
      <p class="debug-badge">{t('common.debugMode')}</p>
    {/if}
  </header>

  {#if report}
    <section class="panel" aria-labelledby="review-result-heading">
      <h2 id="review-result-heading">{t('sc.review.summaryHeading')}</h2>
      <p class="result-line">
        {t('sc.review.resultLine', {
          raw: report.result.raw,
          official: report.result.official,
          rank: report.result.rank,
        })}
      </p>
    </section>

    <section class="panel" aria-labelledby="review-entries-heading">
      <h2 id="review-entries-heading">{t('sc.review.entriesHeading')}</h2>
      {#if refsLoading}
        <p class="hint">{t('sc.review.refsLoading')}</p>
      {/if}
      {#if refsError}
        <p class="error-text">{t('sc.review.refsError')}</p>
      {/if}

      {#if report.entries.length === 0}
        <p class="muted">{t('sc.review.noEntries')}</p>
      {:else}
        <ol class="entries">
          {#each report.entries as entry (entry.pointId + ':' + entry.choiceId + ':' + entry.at.day + ':' + entry.at.minutes)}
            {@const point = pointOf(entry.pointId)}
            {@const choice = choiceOf(entry.choiceId)}
            {@const best = point ? bestChoiceOf(point) : null}
            {@const notBest = point !== null && choice !== null && !isBestChoice(point, choice)}
            {@const percent = choicePercent(stats, entry.pointId, entry.choiceId)}
            <li class="entry">
              <div class="entry-head">
                <span class="entry-time">{formatClock(entry.at)}</span>
                <span class="entry-point">{point ? loc(point.text) : entry.pointId}</span>
              </div>
              <p class="entry-choice">{choice ? loc(choice.text) : entry.choiceId}</p>
              {#if percent !== null}
                <p class="choice-stats" data-choice-stats>{t(RANKING_KEYS.reviewLine, { percent })}</p>
              {/if}

              <dl class="entry-points">
                <div>
                  <dt>{t('sc.review.policyPoints')}</dt>
                  <dd>{signed(entry.policyPoints)}</dd>
                </div>
                {#if debug}
                  <div>
                    <dt>{t('sc.review.itemPoints')}</dt>
                    <dd>{signed(entry.itemPoints)}</dd>
                  </div>
                {/if}
              </dl>

              {#if hasLocalized(choice?.explain)}
                <div class="entry-block explanation">
                  <h3>{t('sc.review.explainHeading')}</h3>
                  <p>{loc(choice.explain)}</p>
                </div>
              {/if}

              {#if hasLocalized(point?.lesson)}
                <div class="entry-block lesson">
                  <h3>{t('sc.review.lessonHeading')}</h3>
                  <p>{loc(point.lesson)}</p>
                </div>
              {/if}

              {#if notBest && best}
                <div class="entry-block model-choice">
                  <h3>{t('sc.review.bestHeading')}</h3>
                  <p class="model-choice-text">{loc(best.text)}</p>
                  {#if hasLocalized(best.explain)}
                    <p>{loc(best.explain)}</p>
                  {/if}
                </div>
              {/if}

              <div class="entry-block">
                <h3>{t('sc.review.refsHeading')}</h3>
                {#if entry.refs.length === 0}
                  <p class="muted">{t('sc.review.noRefs')}</p>
                {:else}
                  <ul class="ref-list">
                    {#each entry.refs as refId}
                      {@const ref = refOf(refId)}
                      <li>
                        {#if ref}
                          <span class="ref-title">{loc(ref.title)}</span>
                          <span class="ref-issuer">{loc(ref.issuer)}</span>
                        {:else}
                          <span class="ref-title">{refId}</span>
                        {/if}
                      </li>
                    {/each}
                  </ul>
                {/if}
              </div>

              {#if notBest && entry.movedBy.some((moved) => moved.misleading)}
                <div class="entry-block moved">
                  <h3>{t('sc.review.movedHeading')}</h3>
                  <ul class="voice-list">
                    {#each entry.movedBy.filter((moved) => moved.misleading) as moved}
                      {@const voice = voiceOf(moved.voiceId)}
                      {#if voice}
                        <li>
                          <span class="media">{mediaGlyph(voice.media)} {t(mediaKey(voice.media))}</span>
                          {#if voice.type}
                            <span class="type">{t(typeLabelKey(voice.type))}</span>
                          {/if}
                          <span class="voice-text">{loc(voice.text)}</span>
                        </li>
                      {/if}
                    {/each}
                  </ul>
                </div>
              {/if}

              {#if entry.delayedHits.length > 0}
                <div class="entry-block delayed">
                  <h3>{t('sc.review.delayedHeading')}</h3>
                  <ul class="delayed-list">
                    {#each entry.delayedHits as hit, index (hit.reason.ja + ':' + index)}
                      <li>
                        <span>{loc(hit.reason)}</span>
                        <span class="pts">{signed(hit.points)}</span>
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}
            </li>
          {/each}
        </ol>
      {/if}
    </section>

    {#if draftGroups.length > 0}
      <section class="panel" aria-labelledby="review-drafts-heading">
        <h2 id="review-drafts-heading">{t('sc.review.draftsHeading')}</h2>
        <div class="draft-reviews">
          {#each draftGroups as group (group.key)}
            <section class="draft-review">
              <h3>{loc(group.draft.title)}</h3>
              {#each group.slots as slotReview (slotReview.slot.id)}
                <div class="draft-slot">
                  <h4>{loc(slotReview.slot.label)}</h4>
                  <p class="label">{t('sc.review.draftChosen')}</p>
                  <p class="draft-option">{loc(slotReview.chosen.text)}</p>
                  {#if hasLocalized(slotReview.chosen.explain)}
                    <p class="label">{t('sc.review.explainHeading')}</p>
                    <p class="explain">{loc(slotReview.chosen.explain)}</p>
                  {/if}
                  {#if slotReview.best}
                    <p class="label">{t('sc.review.bestHeading')}</p>
                    <p class="draft-option">{loc(slotReview.best.text)}</p>
                    {#if hasLocalized(slotReview.best.explain)}
                      <p class="label">{t('sc.review.explainHeading')}</p>
                      <p class="explain">{loc(slotReview.best.explain)}</p>
                    {/if}
                  {/if}
                </div>
              {/each}
            </section>
          {/each}
        </div>
      </section>
    {/if}

    {#if debug}
      <section class="panel" aria-labelledby="review-items-heading">
        <h2 id="review-items-heading">{t('sc.review.itemsHeading')}</h2>
        <div class="item-cols">
          <section>
            <h3>{t('sc.review.itemsEarned')}</h3>
            {#if report.itemsEarned.length === 0}
              <p class="muted">{t('sc.review.itemsEarnedEmpty')}</p>
            {:else}
              <ul class="item-list">
                {#each report.itemsEarned as item (item.id)}
                  <li>
                    <span class="axis">{t(axisLabelKey(item.axis))}</span>
                    <span class="item-id">{item.id}</span>
                    <span class="pts">{signed(item.points)}</span>
                  </li>
                {/each}
              </ul>
            {/if}
          </section>
          <section>
            <h3>{t('sc.review.itemsMissed')}</h3>
            {#if report.itemsMissed.length === 0}
              <p class="muted">{t('sc.review.itemsMissedEmpty')}</p>
            {:else}
              <ul class="item-list">
                {#each report.itemsMissed as item (item.id)}
                  <li>
                    <span class="axis">{t(axisLabelKey(item.axis))}</span>
                    <span class="item-id">{item.id}</span>
                    <span class="pts">{t('sc.review.ifChosen', { points: item.points })}</span>
                  </li>
                {/each}
              </ul>
            {/if}
          </section>
        </div>
      </section>
    {/if}

    <section class="panel" aria-labelledby="review-press-heading">
      <h2 id="review-press-heading">{t('sc.review.pressHeading')}</h2>
      {#if report.pressAnswers.length === 0}
        <p class="muted">{t('sc.review.pressEmpty')}</p>
      {:else}
        {#if $settings.pressTimeScale !== 1}
          <p class="hint">{t('sc.review.pressScale', { scale: $settings.pressTimeScale })}</p>
        {/if}
        <ol class="press-list">
          {#each report.pressAnswers as answer (answer.questionId)}
            {@const question = questionOf(answer.questionId)}
            <li>
              <p class="press-q">
                <span class="label">{t('sc.review.questionLabel')}</span>
                {question ? loc(question.text) : answer.questionId}
              </p>
              <p class="press-a">
                <span class="label">{t('sc.review.answerLabel')}</span>
                {#if answer.answerId}
                  {answerText(question, answer.answerId)}
                {:else}
                  {t('sc.review.pressTimeout')}
                {/if}
              </p>
              <p class="pts">{t('sc.review.pressPoints', { points: answer.points })}</p>
            </li>
          {/each}
        </ol>
      {/if}
    </section>

    <section class="panel" aria-labelledby="review-prologue-heading">
      <h2 id="review-prologue-heading">{t('sc.ending.prologueHeading')}</h2>
      <p class="label">{t('sc.ending.prologueComment')}</p>
      {#if prologueComment.trim() !== ''}
        <blockquote class="quote">{prologueComment}</blockquote>
      {:else}
        <p class="muted">{t('sc.ending.prologueEmpty')}</p>
      {/if}
      <dl class="time-grid">
        <div>
          <dt>{t('sc.ending.predicted')}</dt>
          <dd>
            {#if prologue && prologue.predictedHours !== null}
              {t('sc.ending.predictedValue', { hours: prologue.predictedHours })}
            {:else}
              {t('sc.ending.predictedNone')}
            {/if}
          </dd>
        </div>
        <div>
          <dt>{publishedHours !== null ? t('sc.ending.published') : t('sc.ending.elapsed')}</dt>
          <dd>{t('sc.ending.elapsedValue', { hours: hoursText(shownHours) })}</dd>
        </div>
      </dl>
    </section>

    <div class="notice-stack">
      <p class="notice">{notice('criminal')}</p>
      <p class="notice">{notice('score')}</p>
      <p class="notice">{notice('voices')}</p>
    </div>

    <div class="actions">
      <button type="button" class="btn btn--ghost" onclick={() => window.print()}>
        {t('sc.review.print')}
      </button>
      <button type="button" class="btn btn--primary" onclick={() => screen.set('S01')}>
        {t('sc.review.titleButton')}
      </button>
    </div>
  {:else}
    <div class="panel stack">
      <p>{t('sc.review.missing')}</p>
      <button type="button" class="btn" onclick={() => screen.set('S01')}>
        {t('sc.review.titleButton')}
      </button>
    </div>
  {/if}
</section>

<style>
  .review {
    display: grid;
    gap: 0.9rem;
  }
  .review-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .review-head h1 {
    margin: 0;
    font-size: 1.5em;
  }
  .eyebrow {
    margin: 0;
  }
  .play-count {
    margin: 0;
    color: var(--muted);
  }
  .panel {
    margin: 0;
  }
  .panel h2 {
    margin: 0 0 0.6rem;
    font-size: 0.95em;
    color: var(--muted);
    font-weight: 600;
  }
  .panel h3 {
    margin: 0 0 0.35rem;
    font-size: 0.85em;
    color: var(--muted);
    font-weight: 600;
  }
  .result-line {
    margin: 0;
    font-size: 1.05em;
    font-weight: 700;
  }
  .entries {
    display: grid;
    gap: 0.8rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .entry {
    padding: 0.7rem 0.8rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--bg-soft);
  }
  .entry-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.5rem;
  }
  .entry-time {
    color: var(--accent-strong);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .entry-point {
    color: var(--text-soft);
    font-size: 0.9em;
  }
  .entry-choice {
    margin: 0.35rem 0 0.5rem;
    font-size: 1.02em;
    line-height: 1.8;
  }
  .choice-stats {
    margin: -0.2rem 0 0.5rem;
    color: var(--accent-strong);
    font-size: 0.85em;
  }
  .entry-points {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0 0 0.5rem;
  }
  .entry-points div {
    display: flex;
    gap: 0.35rem;
    align-items: baseline;
    padding: 0.15rem 0.5rem;
    border: 1px solid var(--line);
    border-radius: 5px;
  }
  .entry-points dt {
    color: var(--muted);
    font-size: 0.75em;
  }
  .entry-points dd {
    margin: 0;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .entry-block {
    margin-top: 0.5rem;
  }
  .entry-block p {
    margin: 0.2rem 0 0;
    line-height: 1.8;
  }
  .entry-block h3 {
    margin: 0;
    color: var(--muted);
    font-size: 0.78em;
    font-weight: 600;
  }
  .explanation,
  .lesson {
    padding: 0.45rem 0.6rem;
    border-left: 3px solid var(--line-strong);
    background: var(--bg-soft);
  }
  .model-choice {
    padding: 0.45rem 0.6rem;
    border-left: 3px solid var(--accent);
    background: var(--bg-soft);
  }
  .model-choice-text {
    font-weight: 600;
  }
  .draft-reviews {
    display: grid;
    gap: 0.7rem;
  }
  .draft-review {
    padding: 0.6rem 0.7rem;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--bg-soft);
  }
  .draft-review h3 {
    margin: 0 0 0.4rem;
    font-size: 0.95em;
  }
  .draft-slot + .draft-slot {
    margin-top: 0.6rem;
    padding-top: 0.6rem;
    border-top: 1px solid var(--line);
  }
  .draft-slot h4 {
    margin: 0;
    font-size: 0.85em;
    color: var(--text-soft);
  }
  .draft-option {
    margin: 0.15rem 0 0;
    line-height: 1.7;
  }
  .draft-slot .explain {
    margin: 0.2rem 0 0;
    color: var(--text-soft);
    font-size: 0.9em;
    line-height: 1.8;
  }
  .draft-slot .label {
    display: block;
    margin: 0.35rem 0 0;
  }
  .debug-badge {
    margin: 0;
    padding: 0.1rem 0.5rem;
    border: 1px dashed var(--warn);
    border-radius: 999px;
    color: var(--warn);
    font-size: 0.75em;
  }
  .ref-list,
  .voice-list,
  .delayed-list,
  .item-list,
  .press-list {
    display: grid;
    gap: 0.3rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .ref-list li {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: baseline;
    font-size: 0.9em;
  }
  .ref-title {
    font-weight: 600;
  }
  .ref-issuer {
    color: var(--muted);
    font-size: 0.85em;
  }
  .voice-list li {
    padding: 0.35rem 0.5rem;
    border-left: 3px solid var(--danger);
    background: var(--danger-dim);
    font-size: 0.9em;
    line-height: 1.7;
  }
  .media {
    margin-right: 0.35rem;
    color: var(--muted);
    font-size: 0.8em;
  }
  .type {
    display: inline-block;
    margin-right: 0.35rem;
    padding: 0 0.4em;
    border: 1px solid var(--danger);
    border-radius: 999px;
    color: var(--danger);
    font-size: 0.72em;
  }
  .delayed-list li {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.4rem;
    padding: 0.25rem 0.5rem;
    border: 1px dashed var(--line-strong);
    border-radius: 5px;
    font-size: 0.9em;
  }
  .pts {
    color: var(--warn);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .item-cols {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
    gap: 0.8rem;
  }
  .item-list li {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: baseline;
    padding: 0.25rem 0;
    border-top: 1px solid var(--line);
    font-size: 0.88em;
  }
  .axis {
    min-width: 4.5em;
    color: var(--muted);
  }
  .item-id {
    flex: 1 1 8em;
    color: var(--text-soft);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.85em;
    word-break: break-all;
  }
  .press-list li {
    padding: 0.5rem 0.6rem;
    border: 1px solid var(--line);
    border-radius: 6px;
  }
  .press-q,
  .press-a {
    margin: 0;
    line-height: 1.7;
  }
  .press-a {
    color: var(--text-soft);
  }
  .label {
    display: inline-block;
    margin-right: 0.4rem;
    color: var(--muted);
    font-size: 0.75em;
  }
  .quote {
    margin: 0.4rem 0 0;
    padding: 0.6rem 0.8rem;
    border-left: 3px solid var(--line-strong);
    background: var(--bg-soft);
    color: var(--text-soft);
    line-height: 1.8;
  }
  .time-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
    gap: 0.6rem;
    margin: 0.6rem 0 0;
  }
  .time-grid div {
    padding: 0.5rem 0.6rem;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--bg-soft);
  }
  .time-grid dt {
    margin: 0;
    color: var(--muted);
    font-size: 0.8em;
  }
  .time-grid dd {
    margin: 0.15rem 0 0;
    font-size: 1.05em;
    font-weight: 700;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.5rem;
  }
  @media (max-width: 639px) {
    .actions {
      flex-direction: column-reverse;
    }
    .actions .btn {
      width: 100%;
    }
    .review-head {
      display: block;
    }
  }
  /* 印刷は紙面（白背景）を前提にするため、テーマ変数ではなく固定色を使う */
  @media print {
    :global(html),
    :global(body) {
      background: #fff;
      color: #000;
    }
    .actions {
      display: none;
    }
    .review {
      max-width: none;
      padding: 0;
      color: #000;
    }
    .panel,
    .entry,
    .quote,
    .time-grid div,
    .draft-review,
    .explanation,
    .lesson,
    .model-choice {
      border-color: #999;
      background: #fff;
    }
    .debug-badge {
      display: none;
    }
    .entry,
    .panel {
      break-inside: avoid;
    }
    .notice {
      border-left-color: #666;
      background: #f4f4f4;
      color: #000;
    }
    .voice-list li {
      border-left-color: #666;
      background: #f4f4f4;
    }
    .type {
      border-color: #666;
      color: #000;
    }
  }
</style>
