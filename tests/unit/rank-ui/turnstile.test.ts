import { describe, expect, it } from 'vitest';
import { loadTurnstile } from '../../../src/app/ranking/turnstile';

describe('Turnstile の読み込み', () => {
  it('サイトキーが無ければ何もしない', async () => {
    // document の無い環境（node）でも、キーが空なら即座に諦める
    expect(await loadTurnstile('')).toBeNull();
    expect(await loadTurnstile('   ')).toBeNull();
  });

  it('読み込めない環境でも送信を止めない（null を返す）', async () => {
    expect(await loadTurnstile('site-key')).toBeNull();
  });
});
