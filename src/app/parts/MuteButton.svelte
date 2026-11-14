<script lang="ts">
  // どの画面からでも、BGMと効果音をその場で消す・戻すボタン（設定の muted と共通）
  import { audio } from '../../audio';
  import { saveSettings } from '../../storage';
  import { t } from '../../i18n';
  import { settings } from '../store';

  /** 字幕バーが出ているときは、その上に逃がす */
  let { raised = false }: { raised?: boolean } = $props();

  const muted = $derived($settings.muted);
  const label = $derived(t(muted ? 'sa.sound.unmute' : 'sa.sound.mute'));

  function toggle(): void {
    const next = { ...$settings, muted: !$settings.muted };
    settings.set(next);
    saveSettings(next);
    audio.setVolumes({ bgm: next.bgmVolume, se: next.seVolume, muted: next.muted });
  }
</script>

<button
  type="button"
  class="mute-button"
  class:raised
  data-testid="mute-button"
  aria-pressed={muted}
  aria-label={label}
  title={label}
  onclick={toggle}
>
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
    {#if muted}
      <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none" />
    {:else}
      <path d="M16 8.5a4.5 4.5 0 0 1 0 7M18.5 6a8 8 0 0 1 0 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none" />
    {/if}
  </svg>
</button>

<style>
  .mute-button {
    position: fixed;
    right: 0.75rem;
    bottom: 0.75rem;
    z-index: 40;
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    padding: 0;
    border: 1px solid var(--line-strong);
    border-radius: 50%;
    background: var(--bg);
    color: var(--text);
    box-shadow: 0 2px 6px #0003;
    cursor: pointer;
  }
  .mute-button[aria-pressed='true'] {
    color: var(--danger);
  }
  .mute-button.raised {
    bottom: 6rem;
  }
  @media (max-width: 640px) {
    .mute-button.raised {
      bottom: 7.5rem;
    }
  }
  .mute-button:focus-visible {
    outline: 3px solid var(--focus);
    outline-offset: 2px;
  }
  @media print {
    .mute-button {
      display: none;
    }
  }
</style>
