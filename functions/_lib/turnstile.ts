// Turnstile の siteverify。検証の省略はローカル開発の明示フラグだけに限定する。
const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** フロントのウィジェットとサーバーで合わせる action（別用途のトークン転用を防ぐ） */
export const TURNSTILE_ACTION = 'submit-play';

/** 既定の許可ホスト。本番は ALLOWED_HOSTS で上書きする */
export const DEFAULT_ALLOWED_HOSTS = ['yattemite.pages.dev', 'localhost'];

export type TurnstileResult = { ok: true } | { ok: false; error: string };

export interface TurnstileOptions {
  secret?: string;
  token?: string;
  ip?: string;
  /** ローカル開発用（ALLOW_NO_TURNSTILE）。秘密鍵が無くても通す */
  allowUnverified?: boolean;
  /** siteverify が返す hostname の許可リスト */
  allowedHosts?: string[];
  /** 空文字なら action を照合しない */
  action?: string;
  fetcher?: typeof fetch;
}

/** カンマ区切りの許可ホスト。先頭 '.' はサブドメイン一致 */
export function parseAllowedHosts(value: string | undefined | null): string[] {
  if (typeof value !== 'string' || value.trim() === '') return [...DEFAULT_ALLOWED_HOSTS];
  const hosts = value.split(',').map((host) => host.trim().toLowerCase()).filter((host) => host !== '');
  return hosts.length > 0 ? hosts : [...DEFAULT_ALLOWED_HOSTS];
}

function hostAllowed(hostname: string, allowed: string[]): boolean {
  const host = hostname.toLowerCase();
  return allowed.some((entry) =>
    entry.startsWith('.') ? host === entry.slice(1) || host.endsWith(entry) : host === entry);
}

export async function verifyTurnstile(options: TurnstileOptions): Promise<TurnstileResult> {
  const {
    secret,
    token,
    ip,
    allowUnverified = false,
    allowedHosts = DEFAULT_ALLOWED_HOSTS,
    action = TURNSTILE_ACTION,
    fetcher = fetch,
  } = options;

  if (!secret) {
    // 秘密鍵が無い間は、明示されたローカル開発以外は受け付けない
    return allowUnverified ? { ok: true } : { ok: false, error: 'turnstile_not_configured' };
  }
  if (!token) return { ok: false, error: 'turnstile_missing' };

  const form = new URLSearchParams({ secret, response: token });
  if (ip && ip !== 'local') form.set('remoteip', ip);

  try {
    const response = await fetcher(SITEVERIFY_URL, { method: 'POST', body: form });
    if (!response.ok) return { ok: false, error: 'turnstile_failed' };
    const data = (await response.json()) as {
      success?: boolean;
      hostname?: unknown;
      action?: unknown;
    };
    if (data.success !== true) return { ok: false, error: 'turnstile_failed' };

    // 別ホスト・別用途で発行されたトークンの転用を防ぐ
    if (typeof data.hostname !== 'string' || !hostAllowed(data.hostname, allowedHosts)) {
      return { ok: false, error: 'turnstile_host_mismatch' };
    }
    if (action !== '' && data.action !== action) {
      return { ok: false, error: 'turnstile_action_mismatch' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'turnstile_failed' };
  }
}
