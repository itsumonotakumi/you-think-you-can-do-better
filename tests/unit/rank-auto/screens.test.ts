// 画面の実装確認（#7）。同意画面を消し、プレイ前の注意書き・自動登録・削除を出す。
import { describe, expect, it } from 'vitest';

const sources = import.meta.glob<string>('/src/app/screens/*.svelte', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function source(name: string): string {
  const text = sources[`/src/app/screens/${name}`];
  if (text === undefined) throw new Error(`画面が見つからない: ${name}`);
  return text;
}

describe('S04RoleSelect（プレイ前）', () => {
  const text = source('S04RoleSelect.svelte');

  it('ランキングが有効なときだけニックネーム欄を出す', () => {
    expect(text).toContain('isRankingEnabled()');
    expect(text).toContain('data-ranking-nickname');
    expect(text).toContain('data-ranking-nickname-panel');
    expect(text).toContain('data-ranking-optout');
  });

  it('本名を入れない注意書きと自動登録の説明を出す', () => {
    expect(text).toContain('RANKING_KEYS.nicknameWarning');
    expect(text).toContain('RANKING_KEYS.autoNotice');
    expect(text).toContain('data-ranking-warning');
    expect(text).toContain('data-ranking-auto-notice');
  });

  it('空のニックネームでは開始できない', () => {
    expect(text).toContain('isValidNickname(nickname)');
    expect(text).toContain('disabled={busy !== null || (rankingEnabled && !isValidNickname(nickname))}');
  });
});

describe('S08Ending（自動登録）', () => {
  const text = source('S08Ending.svelte');

  it('同意チェックや送信ボタンを置かず、結果画面で自動送信する', () => {
    expect(text).toContain('submitPlay(');
    expect(text).toContain('prepareRanking(');
    expect(text).not.toContain('data-ranking-agree');
    expect(text).not.toContain('data-ranking-submit');
  });

  it('送信状態と順位、失敗時の再送を出す', () => {
    expect(text).toContain('data-ranking-status');
    expect(text).toContain('rk.status.sending');
    expect(text).toContain('rk.status.done');
    expect(text).toContain('rk.status.failed');
    expect(text).toContain('data-ranking-retry');
    expect(text).toContain('rk.status.position');
  });

  it('Turnstile のトークンが取れたら送る', () => {
    expect(text).toContain('mountTurnstile(');
    expect(text).toContain('rankingStatus');
    expect(text).toContain('turnstileSiteKey()');
  });
});

describe('S12Ranking（設定と削除）', () => {
  const text = source('S12Ranking.svelte');

  it('同意画面と送信ボタンを持たない', () => {
    expect(text).not.toContain('data-ranking-agree');
    expect(text).not.toContain('data-ranking-submit');
    expect(text).not.toContain('rk.join.consent');
    expect(text).not.toContain('data-ranking-open');
  });

  it('ニックネームの変更と参加しない設定を置く', () => {
    expect(text).toContain('data-ranking-settings');
    expect(text).toContain('data-ranking-nickname');
    expect(text).toContain('data-ranking-optout');
    expect(text).toContain('data-ranking-save');
  });

  it('確認してから自分の記録を削除できる', () => {
    expect(text).toContain('deletePlays(');
    expect(text).toContain('data-ranking-delete');
    expect(text).toContain('data-ranking-delete-confirm');
    expect(text).toContain('data-ranking-delete-cancel');
    expect(text).toContain('rk.delete.cache');
  });
});
