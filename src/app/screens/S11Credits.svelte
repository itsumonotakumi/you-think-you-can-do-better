<script lang="ts">
  import { loadAudioManifest } from '../../data/loader';
  import { setLang, t } from '../../i18n';
  import { backTo, screen, settings } from '../store';
  import type { AudioAsset } from '../../engine/types';
  import '../styles/base.css';

  type Phase = 'loading' | 'ready' | 'error';

  let assets = $state<AudioAsset[]>([]);
  let phase = $state<Phase>('loading');

  async function load(): Promise<void> {
    phase = 'loading';
    try {
      assets = await loadAudioManifest();
      phase = 'ready';
    } catch {
      phase = 'error';
    }
  }

  $effect(() => {
    void load();
  });

  const ui = $derived.by(() => {
    setLang($settings.lang);
    return {
      title: t('sa.credits.title'),
      createdBy: t('sa.credits.createdBy'),
      author: t('sa.credits.author'),
      audio: t('sa.credits.audio'),
      audioEmpty: t('sa.credits.audioEmpty'),
      authorLabel: t('sa.credits.authorLabel'),
      site: t('sa.credits.site'),
      terms: t('sa.credits.terms'),
      checked: t('sa.credits.checked'),
      licenseNote: t('sa.credits.licenseNote'),
      loadError: t('sa.credits.loadError'),
      thanks: t('sa.credits.thanks'),
      back: t('sa.common.back'),
      loading: t('sa.common.loading'),
      retry: t('sa.common.retry'),
      kind: (kind: AudioAsset['kind']) => t(`sa.credits.kind.${kind}`),
    };
  });

  const groups = $derived.by(() => {
    const kinds: AudioAsset['kind'][] = ['bgm', 'se', 'ambience'];
    return kinds
      .map((kind) => ({ kind, items: assets.filter((a) => a.kind === kind) }))
      .filter((g) => g.items.length > 0);
  });

  function back(): void {
    screen.set($backTo);
  }
</script>

<section class="screen screen--narrow" data-screen="S11Credits">
  <header class="screen-head">
    <h1>{ui.title}</h1>
  </header>

  <div class="panel stack">
    <h2>{ui.createdBy}</h2>
    <p class="credit-author">{ui.author}</p>
  </div>

  <div class="panel stack">
    <h2>{ui.audio}</h2>

    {#if phase === 'loading'}
      <p class="muted" role="status">{ui.loading}</p>
    {:else if phase === 'error'}
      <p class="error-text" role="alert">{ui.loadError}</p>
      <button class="btn" onclick={load}>{ui.retry}</button>
    {:else if groups.length === 0}
      <p class="muted">{ui.audioEmpty}</p>
    {:else}
      {#each groups as group (group.kind)}
        <section class="credit-group" aria-labelledby="credit-kind-{group.kind}">
          <h3 id="credit-kind-{group.kind}">{ui.kind(group.kind)}</h3>
          <ul class="credit-list">
            {#each group.items as asset (asset.id)}
              <li class="credit-item">
                <p class="credit-title">{asset.title}</p>
                <dl class="credit-meta">
                  <div class="credit-meta__row">
                    <dt>{ui.authorLabel}</dt>
                    <dd>{asset.author}</dd>
                  </div>
                  <div class="credit-meta__row">
                    <dt>{ui.site}</dt>
                    <dd>{asset.site}</dd>
                  </div>
                  <div class="credit-meta__row">
                    <dt>{ui.checked}</dt>
                    <dd>{asset.termsCheckedAt}</dd>
                  </div>
                  <div class="credit-meta__row">
                    <dt>{ui.terms}</dt>
                    <dd class="link-text">{asset.termsUrl}</dd>
                  </div>
                </dl>
                {#if asset.conditions.creditRequired && asset.conditions.creditText}
                  <p class="credit-required">{asset.conditions.creditText}</p>
                {/if}
              </li>
            {/each}
          </ul>
        </section>
      {/each}
    {/if}
  </div>

  <p class="notice">{ui.licenseNote}</p>
  <p class="footer-note">{ui.thanks}</p>

  <div class="row">
    <button class="btn btn--ghost" onclick={back}>{ui.back}</button>
  </div>
</section>
