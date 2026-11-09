// デバッグ表示の判定。結果画面の細目は ?debug=1 か #debug のときだけ出す。
const TRUE_VALUES = new Set(['1', 'true', 'on', 'yes']);

function hasDebugParam(value: string): boolean {
  const params = new URLSearchParams(value);
  if (!params.has('debug')) return false;
  const raw = params.get('debug') ?? '';
  return raw === '' || TRUE_VALUES.has(raw.toLowerCase());
}

/** URL 文字列からデバッグ表示かを判定する（テストしやすいように分離） */
export function isDebugUrl(url: string): boolean {
  const hashIndex = url.indexOf('#');
  const beforeHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const hash = hashIndex >= 0 ? url.slice(hashIndex + 1) : '';
  const queryIndex = beforeHash.indexOf('?');
  const query = queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : '';
  // #debug / #?debug=1 / #debug=1 のどれでも受け付ける
  const hashParams = hash.startsWith('?') ? hash.slice(1) : hash;
  return hasDebugParam(query) || hasDebugParam(hashParams);
}

/** 現在の URL がデバッグ表示か。URL が無い環境（SSR・テスト）では false */
export function isDebug(): boolean {
  try {
    const location = (globalThis as { location?: { href?: unknown } }).location;
    return typeof location?.href === 'string' && isDebugUrl(location.href);
  } catch {
    return false;
  }
}
