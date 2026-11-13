/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** ランキング API のベース URL（例: https://yattemite.example.com）。未設定ならランキング UI を出さない */
  readonly VITE_API_BASE?: string;
  /** Cloudflare Turnstile のサイトキー。未設定ならウィジェットを読み込まない */
  readonly VITE_TURNSTILE_SITEKEY?: string;
}
