<script lang="ts">
  // 選択肢。数字キーは S05 側で受ける。体力が低いときは文言の後ろ側を薄くする
  import type { Choice } from '../../engine/types';
  import { STAMINA_BLUR } from '../../engine/types';
  import { t, loc } from '../../i18n';
  import { splitForFatigue } from './logic';

  let {
    choices,
    stamina,
    disabled = false,
    onselect,
  }: {
    choices: Choice[];
    stamina: number;
    disabled?: boolean;
    onselect: (choiceId: string) => void;
  } = $props();
</script>

<ol class="choices">
  {#each choices as choice, index (choice.id)}
    {@const split = splitForFatigue(loc(choice.text), stamina)}
    <li>
      <button
        type="button"
        class="choice"
        {disabled}
        onclick={() => onselect(choice.id)}
        aria-keyshortcuts={String(index + 1)}
      >
        <span class="key" aria-hidden="true">{index + 1}</span>
        <span class="text">
          {split.normal}{#if split.faded}<span class="faded">{split.faded}</span>{/if}
        </span>
      </button>
    </li>
  {/each}
</ol>

{#if stamina < STAMINA_BLUR}
  <p class="fatigue-note">{t('sb.choices.staminaNote')}</p>
{/if}

<style>
  .choices {
    display: grid;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .choice {
    display: flex;
    gap: 0.7rem;
    align-items: baseline;
    width: 100%;
    padding: 0.7rem 0.9rem;
    border: 1px solid var(--border, #3a3f4b);
    border-radius: 6px;
    background: var(--panel-2, #222731);
    color: var(--text, #e8e6e1);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .choice:hover:not(:disabled) {
    border-color: var(--accent, #d8b26a);
  }
  .choice:focus-visible {
    outline: 2px solid var(--focus, #8ab4f8);
    outline-offset: 2px;
  }
  .choice:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .key {
    flex: 0 0 auto;
    min-width: 1.5rem;
    padding: 0 0.3rem;
    border: 1px solid var(--border, #3a3f4b);
    border-radius: 4px;
    color: var(--muted, #a3a8b3);
    font-variant-numeric: tabular-nums;
    text-align: center;
    font-size: 0.85rem;
  }
  .text {
    line-height: 1.6;
  }
  .faded {
    opacity: 0.55;
  }
  .fatigue-note {
    margin: 0.5rem 0 0;
    color: var(--muted, #a3a8b3);
    font-size: 0.85rem;
  }
</style>
