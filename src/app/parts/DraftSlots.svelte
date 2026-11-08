<script lang="ts">
  // 文案作成の部品選択。auto の部品は時計から決まるので選択欄を出さない
  import type { Draft } from '../../engine/types';
  import { t, loc } from '../../i18n';

  let {
    draft,
    selections,
    onselect,
  }: {
    draft: Draft;
    selections: Record<string, string>;
    onselect: (slotId: string, itemId: string) => void;
  } = $props();
</script>

<div class="slots">
  {#each draft.slots as slot (slot.id)}
    <fieldset>
      <legend>
        {loc(slot.label)}
        {#if slot.auto}<span class="tag">{t('sb.draft.auto')}</span>{/if}
      </legend>
      {#if slot.auto}
        <p class="auto-value">{t('sb.draft.autoValue')}</p>
      {:else}
        <div class="options">
          {#each slot.options ?? [] as option (option.id)}
            <label class="option" class:selected={selections[slot.id] === option.id}>
              <input
                type="radio"
                name={`slot-${slot.id}`}
                checked={selections[slot.id] === option.id}
                onchange={() => onselect(slot.id, option.id)}
              />
              <span>{loc(option.text)}</span>
            </label>
          {/each}
        </div>
      {/if}
    </fieldset>
  {/each}
</div>

<style>
  .slots {
    display: grid;
    gap: 0.7rem;
  }
  fieldset {
    display: grid;
    gap: 0.4rem;
    margin: 0;
    padding: 0.6rem 0.8rem;
    border: 1px solid var(--border, #3a3f4b);
    border-radius: 6px;
    background: var(--panel, #1b1f27);
  }
  legend {
    padding: 0 0.3rem;
    font-size: 0.9rem;
    font-weight: 600;
  }
  .tag {
    margin-left: 0.4rem;
    padding: 0 0.4rem;
    border: 1px solid var(--border, #3a3f4b);
    border-radius: 999px;
    color: var(--muted, #a3a8b3);
    font-size: 0.75rem;
    font-weight: 400;
  }
  .auto-value {
    margin: 0;
    color: var(--muted, #a3a8b3);
    font-size: 0.9rem;
  }
  .options {
    display: grid;
    gap: 0.35rem;
  }
  .option {
    display: flex;
    gap: 0.55rem;
    align-items: baseline;
    padding: 0.45rem 0.55rem;
    border: 1px solid var(--border, #3a3f4b);
    border-radius: 5px;
    cursor: pointer;
  }
  .option.selected {
    border-color: var(--accent, #d8b26a);
    background: var(--panel-2, #222731);
  }
  .option input {
    flex: 0 0 auto;
    accent-color: var(--accent, #d8b26a);
  }
  .option span {
    line-height: 1.5;
  }
  .option:focus-within {
    outline: 2px solid var(--focus, #8ab4f8);
    outline-offset: 2px;
  }
</style>
