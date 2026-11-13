// ニックネームの正規化と検査
import { describe, expect, it } from 'vitest';
import { checkNickname, normalizeNickname, NICKNAME_MAX } from '../../../functions/_lib/nickname';

describe('normalizeNickname', () => {
  it('NFKC で全角英数を半角にそろえる', () => {
    expect(normalizeNickname('ＴＡＫＵＭＩ１２３')).toBe('TAKUMI123');
  });

  it('前後の空白を落とし、連続する空白を 1 つにする', () => {
    expect(normalizeNickname('  た く み  さん  ')).toBe('た く み さん');
  });
});

describe('checkNickname', () => {
  it('正しい名前を受け付け、正規化した値を返す', () => {
    const result = checkNickname('  ＡＢＣ  ');
    expect(result).toEqual({ ok: true, value: 'ABC' });
  });

  it(`最大 ${NICKNAME_MAX} 文字まで受け付ける`, () => {
    expect(checkNickname('あ'.repeat(NICKNAME_MAX)).ok).toBe(true);
    expect(checkNickname('あ'.repeat(NICKNAME_MAX + 1))).toEqual({
      ok: false,
      error: 'nickname_too_long',
    });
  });

  it('絵文字を 1 文字として数える', () => {
    expect(checkNickname('🔥'.repeat(NICKNAME_MAX)).ok).toBe(true);
    expect(checkNickname('🔥'.repeat(NICKNAME_MAX + 1)).ok).toBe(false);
  });

  it('空・空白だけ・文字列以外を拒否する', () => {
    expect(checkNickname('')).toEqual({ ok: false, error: 'nickname_required' });
    expect(checkNickname('   ')).toEqual({ ok: false, error: 'nickname_required' });
    expect(checkNickname(null)).toEqual({ ok: false, error: 'nickname_required' });
    expect(checkNickname(123)).toEqual({ ok: false, error: 'nickname_required' });
  });

  it('記号だけ・制御文字を拒否する', () => {
    expect(checkNickname('!!!')).toEqual({ ok: false, error: 'nickname_invalid' });
    expect(checkNickname('あ\u200bい')).toEqual({ ok: false, error: 'nickname_invalid' });
    expect(checkNickname('あ\u0007い')).toEqual({ ok: false, error: 'nickname_invalid' });
  });

  it('URL を拒否する', () => {
    expect(checkNickname('https://例.jp')).toEqual({ ok: false, error: 'nickname_url' });
    expect(checkNickname('a.io')).toEqual({ ok: false, error: 'nickname_url' });
    expect(checkNickname('www.a.jp')).toEqual({ ok: false, error: 'nickname_url' });
  });

  it('不適切語を拒否する', () => {
    expect(checkNickname('しね')).toEqual({ ok: false, error: 'nickname_denied' });
    expect(checkNickname('FUCK')).toEqual({ ok: false, error: 'nickname_denied' });
    expect(checkNickname('ころしてやる殺す')).toEqual({ ok: false, error: 'nickname_denied' });
  });
});
