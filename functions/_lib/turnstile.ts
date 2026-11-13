// Turnstile の siteverify。秘密鍵が未設定の開発時は検証を飛ばす。
const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export type TurnstileResult = { ok: true } | { ok: false; error: string };

export interface TurnstileOptions {
  secret?: string;
  token?: string;
  ip?: string;
  /** 本番では true。秘密鍵が無いときに拒否する */
  required?: boolean;
  fetcher?: typeof fetch;
}

export async function verifyTurnstile(options: TurnstileOptions): Promise<TurnstileResult> {
  const { secret, token, ip, required = false, fetcher = fetch } = options;
  if (!secret) {
    return required
      ? { ok: false, error: 'turnstile_not_configured' }
      : { ok: true };
  }
  if (!token) return { ok: false, error: 'turnstile_missing' };

  const form = new URLSearchParams({ secret, response: token });
  if (ip && ip !== 'local') form.set('remoteip', ip);

  try {
    const response = await fetcher(SITEVERIFY_URL, { method: 'POST', body: form });
    if (!response.ok) return { ok: false, error: 'turnstile_failed' };
    const data = (await response.json()) as { success?: boolean };
    return data.success ? { ok: true } : { ok: false, error: 'turnstile_failed' };
  } catch {
    return { ok: false, error: 'turnstile_failed' };
  }
}
