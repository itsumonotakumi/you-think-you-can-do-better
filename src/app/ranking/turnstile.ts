// Cloudflare Turnstile の読み込み（#7）。サイトキーがある時だけスクリプトを読む。
// 読み込めない・CSP で止まる場合も、空トークンで先へ進める（送信はサーバーが判定する）。

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const SCRIPT_MARK = 'data-ytcdb-turnstile';

/**
 * ウィジェットの用途。サーバーの siteverify が action を照合するので、
 * 別の用途で発行したトークンを投稿に転用できない。
 */
export const TURNSTILE_ACTION = 'submit-play';

export interface TurnstileOptions {
  sitekey: string;
  /** サーバー側で照合する用途。省略すると Turnstile の既定（未設定）になる */
  action?: string;
  callback?: (token: string) => void;
  'error-callback'?: () => void;
  'expired-callback'?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  size?: 'normal' | 'compact' | 'flexible';
  language?: string;
}

export interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileOptions): string | number;
  remove(widgetId: string | number): void;
  reset(widgetId?: string | number): void;
}

type TurnstileWindow = Window & { turnstile?: TurnstileApi };

let loader: Promise<TurnstileApi | null> | null = null;

/** スクリプトを一度だけ読み込む。サイトキーが無ければ何もしない */
export function loadTurnstile(sitekey: string): Promise<TurnstileApi | null> {
  if (sitekey.trim() === '') return Promise.resolve(null);
  if (loader) return loader;

  loader = new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }
    const win = globalThis as unknown as TurnstileWindow;
    if (win.turnstile && typeof win.turnstile.render === 'function') {
      resolve(win.turnstile);
      return;
    }
    if (document.querySelector(`script[${SCRIPT_MARK}]`)) {
      resolve(win.turnstile ?? null);
      return;
    }

    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.setAttribute(SCRIPT_MARK, '1');
    script.onload = () => {
      resolve(win.turnstile && typeof win.turnstile.render === 'function' ? win.turnstile : null);
    };
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
  return loader;
}

/**
 * ウィジェットを描画し、片付け用の関数を返す。
 * 読み込めないときは null（呼び出し側は空トークンのまま送信できる）。
 */
export async function mountTurnstile(
  container: HTMLElement,
  sitekey: string,
  onToken: (token: string) => void,
  language = 'ja',
): Promise<(() => void) | null> {
  const api = await loadTurnstile(sitekey);
  if (!api) return null;

  let widgetId: string | number | null = null;
  try {
    widgetId = api.render(container, {
      sitekey,
      action: TURNSTILE_ACTION,
      callback: onToken,
      'expired-callback': () => onToken(''),
      'error-callback': () => onToken(''),
      theme: 'auto',
      size: 'flexible',
      language,
    });
  } catch {
    return null;
  }

  return () => {
    if (widgetId === null) return;
    try {
      api.remove(widgetId);
    } catch {
      // すでに消えている場合は何もしない
    }
    widgetId = null;
  };
}
