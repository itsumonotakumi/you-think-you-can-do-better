<script lang="ts">
  // 状況テキストのタイプ表示。クリック（Enter/Space）で全文。reduceMotion なら即時表示
  import { onMount } from 'svelte';

  let {
    text,
    instant = false,
    speed = 26,
  }: { text: string; instant?: boolean; speed?: number } = $props();

  let shown = $state('');
  let done = $state(false);
  let systemReduce = $state(false);
  let timer: ReturnType<typeof setInterval> | undefined;

  onMount(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    systemReduce = query.matches;
    const onChange = (event: MediaQueryListEvent): void => {
      systemReduce = event.matches;
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  });

  function stop(): void {
    if (timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  }

  function reveal(): void {
    stop();
    shown = text;
    done = true;
  }

  $effect(() => {
    const full = text;
    const skip = instant || systemReduce;
    stop();
    shown = '';
    done = false;
    if (skip || full.length === 0) {
      shown = full;
      done = true;
      return;
    }
    let i = 0;
    timer = setInterval(() => {
      i += 1;
      shown = full.slice(0, i);
      if (i >= full.length) {
        done = true;
        stop();
      }
    }, speed);
    return stop;
  });
</script>

<button type="button" class="typewriter" onclick={reveal} title={text}>
  <span class="typed" aria-hidden="true">{shown}</span>
  <span class="caret" class:done aria-hidden="true">▌</span>
  <span class="sr-only">{text}</span>
</button>

<style>
  .typewriter {
    display: block;
    width: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .typewriter:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 3px;
    border-radius: 4px;
  }
  .typed {
    white-space: pre-wrap;
    line-height: 1.75;
  }
  .caret {
    opacity: 0.5;
  }
  .caret.done {
    display: none;
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
  /* 演出を減らす（端末設定・アプリ設定）ならカーソルも止める */
  :global(.reduce-motion) .caret {
    display: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .caret {
      display: none;
    }
  }
</style>
