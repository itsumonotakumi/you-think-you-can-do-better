// ニックネームの正規化と検査。保存する前に NFKC で揃える。
export const NICKNAME_MAX = 16;

/** 小さな拒否語リスト（すり抜けは完全には防げない前提の最低限） */
const DENY_WORDS = [
  '死ね', '殺す', '殺害', 'しね', 'レイプ', '強姦', 'クソ', 'うんこ', 'ちんこ', 'まんこ',
  'fuck', 'shit', 'bitch', 'cunt', 'nigger', 'rape', 'porn', 'nazi',
];

const URL_PATTERNS = [
  /https?:\/\//i,
  /www\./i,
  /\b[a-z0-9-]+\.(?:com|net|org|jp|io|co|me|app|dev|xyz|info|biz|tv|cc|link|site|top|shop)\b/i,
];

export type NicknameResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

/** NFKC + 前後の空白除去 + 連続空白の圧縮 */
export function normalizeNickname(raw: string): string {
  return raw.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

export function checkNickname(raw: unknown): NicknameResult {
  if (typeof raw !== 'string') return { ok: false, error: 'nickname_required' };
  const value = normalizeNickname(raw);
  if (value.length === 0) return { ok: false, error: 'nickname_required' };
  if ([...value].length > NICKNAME_MAX) return { ok: false, error: 'nickname_too_long' };
  // 制御文字・書式文字（改行やゼロ幅文字）を拒否
  if (/[\p{Cc}\p{Cf}]/u.test(value)) return { ok: false, error: 'nickname_invalid' };
  if (!/[\p{L}\p{N}\p{So}]/u.test(value)) return { ok: false, error: 'nickname_invalid' };
  if (URL_PATTERNS.some((pattern) => pattern.test(value))) {
    return { ok: false, error: 'nickname_url' };
  }
  const lowered = value.toLowerCase();
  if (DENY_WORDS.some((word) => lowered.includes(word))) {
    return { ok: false, error: 'nickname_denied' };
  }
  return { ok: true, value };
}
