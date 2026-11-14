// 削除用の鍵（#7）。端末が作った 32 バイトの乱数を受け取り、SHA-256 のハッシュだけを保存する。
export const DELETE_KEY_RE = /^[A-Za-z0-9_-]{32,64}$/;

export function isDeleteKey(value: unknown): value is string {
  return typeof value === 'string' && DELETE_KEY_RE.test(value);
}

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** 鍵そのものは保存しない。ハッシュだけを持つ */
export async function hashDeleteKey(deleteKey: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(deleteKey));
  return hex(digest);
}
