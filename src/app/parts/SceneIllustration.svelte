<script lang="ts">
  // 段階の切り替わりに出す挿絵。画像は飾りなので、読み込めなくても進行を止めない。
  let { src, alt }: { src: string; alt: string } = $props();

  /** 読み込みに失敗した画像の src。別の画像に変わったらまた表示する */
  let failedSrc = $state('');
</script>

{#if failedSrc !== src}
  <figure class="scene-illustration" data-part="scene-illustration">
    <img
      {src}
      {alt}
      width="1280"
      height="720"
      decoding="async"
      onerror={() => (failedSrc = src)}
    />
  </figure>
{/if}

<style>
  .scene-illustration {
    margin: 0 0 0.6rem;
    max-width: 100%;
    animation: scene-fade 0.3s ease-out both;
  }
  .scene-illustration img {
    display: block;
    width: 100%;
    max-width: 100%;
    height: auto;
    aspect-ratio: 16 / 9;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel-hover);
    object-fit: cover;
  }
  /* OS の「演出を減らす」設定では base.css がアニメーションを止める */
  @keyframes scene-fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
