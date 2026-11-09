<script lang="ts">
  import { audio } from '../../audio';
  import { loadReferences, loadScenario } from '../../data/loader';
  import { loc, setLang, t } from '../../i18n';
  import { loadPrologue, nextPlayCount, registerPlayStart, saveProgress } from '../../storage';
  import { applyStep, scenario, screen, selectedScenarioId, settings } from '../store';
  import { portrait } from '../illustrations';
  import type { RoleId, Scenario } from '../../engine/types';
  import { ROLES } from '../../engine/types';
  // エンジン本体（src/engine/index.ts）は別担当。未着の間も型検査を通すため解決エラーだけ抑止する。
  // @ts-ignore -- 実装が入れば通常の import として解決される
  import { startPlay } from '../../engine';
  import '../styles/base.css';

  type Phase = 'loading' | 'ready' | 'error';

  let current = $state<Scenario | null>(null);
  let phase = $state<Phase>('loading');
  let busy = $state<RoleId | null>(null);
  let error = $state('');

  $effect(() => {
    const id = $selectedScenarioId;
    if (!id) {
      screen.set('S03');
      return;
    }
    let alive = true;
    phase = 'loading';
    error = '';
    loadScenario(id)
      .then((sc) => {
        if (!alive) return;
        scenario.set(sc);
        current = sc;
        phase = 'ready';
      })
      .catch(() => {
        if (alive) phase = 'error';
      });
    return () => {
      alive = false;
    };
  });

  const ui = $derived.by(() => {
    setLang($settings.lang);
    return {
      title: t('sa.roles.title'),
      lead: t('sa.roles.lead'),
      info: t('sa.roles.info'),
      choose: t('sa.roles.choose'),
      back: t('sa.common.back'),
      loading: t('sa.common.loading'),
      retry: t('sa.common.retry'),
      loadError: t('sa.roles.loadError'),
      startError: t('sa.roles.startError'),
    };
  });

  const roles = $derived.by(() => {
    setLang($settings.lang);
    const sc = current;
    if (!sc) return [];
    return ROLES.filter((role) => Boolean(sc.roles[role])).map((role) => {
      const script = sc.roles[role]!;
      const label = t(`sa.roles.role.${role}`);
      return {
        role,
        label,
        portraitSrc: portrait(sc.id, role),
        portraitAlt: t('sa.images.portrait', { role: label }),
        info: t(`sa.roles.info.${role}`),
        intro: loc(script.intro),
        estimate: t('sa.roles.estimate', { n: script.estimateMinutes }),
        next: t('sa.roles.next', { n: nextPlayCount(sc.id, role) }),
      };
    });
  });

  const scenarioTitle = $derived.by(() => {
    setLang($settings.lang);
    return current ? loc(current.title) : '';
  });

  function back(): void {
    screen.set('S03');
  }

  async function choose(role: RoleId): Promise<void> {
    const sc = current;
    if (!sc || busy) return;
    audio.playSe('select');
    busy = role;
    error = '';
    try {
      const refs = await loadReferences();
      const count = registerPlayStart(sc.id, role);
      const prologue = loadPrologue() ?? { comment: '', predictedHours: null };
      const startedAt = new Date().toISOString();
      const result = startPlay(sc, role, count, prologue, startedAt, refs);
      applyStep(result);
      saveProgress(result.state);
      // 本編の前にプロローグ（S02）を挟む
      screen.set('S02');
    } catch {
      error = ui.startError;
    } finally {
      busy = null;
    }
  }
</script>

<section class="screen" data-screen="S04RoleSelect">
  <header class="screen-head">
    <h1>{ui.title}</h1>
    {#if scenarioTitle}
      <p class="eyebrow">{scenarioTitle}</p>
    {/if}
    <p class="lead">{ui.lead}</p>
  </header>

  {#if phase === 'loading'}
    <p class="muted" role="status">{ui.loading}</p>
  {:else if phase === 'error'}
    <div class="panel stack">
      <p class="error-text" role="alert">{ui.loadError}</p>
      <button class="btn" onclick={back}>{ui.back}</button>
    </div>
  {:else}
    <ul class="role-list">
      {#each roles as item (item.role)}
        <li class="role-card">
          <div class="role-card__body">
            <div class="role-card__head">
              {#if item.portraitSrc}
                <img
                  class="role-card__portrait"
                  src={item.portraitSrc}
                  alt={item.portraitAlt}
                  width="480"
                  height="480"
                  loading="lazy"
                  decoding="async"
                  onerror={(event) => {
                    (event.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              {/if}
              <h2 class="role-card__title">{item.label}</h2>
            </div>
            <p class="role-card__intro">{item.intro}</p>
            <p class="role-card__info">
              <span class="tag">{ui.info}</span>
              {item.info}
            </p>
            <p class="role-card__meta muted small">
              {item.estimate} ・ {item.next}
            </p>
          </div>
          <button
            class="btn btn--primary btn--wide"
            disabled={busy !== null}
            onclick={() => choose(item.role)}
          >{busy === item.role ? ui.loading : ui.choose}</button>
        </li>
      {/each}
    </ul>

    {#if error}
      <p class="error-text" role="alert">{error}</p>
    {/if}

    <div class="row">
      <button class="btn btn--ghost" onclick={back}>{ui.back}</button>
    </div>
  {/if}
</section>

<style>
  .role-card__head {
    display: flex;
    align-items: center;
    gap: 0.75em;
  }
  .role-card__portrait {
    display: block;
    flex: 0 0 auto;
    width: 72px;
    height: 72px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--panel-hover);
    object-fit: cover;
  }
</style>
