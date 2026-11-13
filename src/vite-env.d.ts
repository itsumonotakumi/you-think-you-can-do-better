/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * 共有するURLの公開先（例: https://example.com/ytcdb）。
   * GitHub Pages 版と Cloudflare 版で別の値をビルド時に渡す。末尾スラッシュは付けない。
   */
  readonly VITE_SITE_URL?: string;
  /** ランキング API のベース URL（例: https://yattemite.example.com）。未設定ならランキング UI を出さない */
  readonly VITE_API_BASE?: string;
  /** Cloudflare Turnstile のサイトキー。未設定ならウィジェットを読み込まない */
  readonly VITE_TURNSTILE_SITEKEY?: string;
}
