// 投稿文。サービスの文字数に収まり、タグとURLが残ることを固定する。
import { describe, expect, it } from 'vitest';
import {
  PLATFORM_LIMITS, SHARE_PLATFORMS, buildPostText, charCount, truncateText,
} from '../../../src/app/share/text';
import { SHARE_HASHTAG } from '../../../src/app/share/data';
import { makeCard } from './fixtures';

describe('buildPostText', () => {
  it('どのサービスでも上限に収まり、ハッシュタグとURLが入る', () => {
    const card = makeCard();
    for (const platform of SHARE_PLATFORMS) {
      const text = buildPostText(card, platform);
      expect(charCount(text), platform).toBeLessThanOrEqual(PLATFORM_LIMITS[platform]);
      expect(text, platform).toContain(SHARE_HASHTAG);
      expect(text, platform).toContain(card.url);
      expect(text, platform).toContain(card.title);
    }
  });

  it('見出しと称号が短ければそのまま入る', () => {
    const text = buildPostText(
      makeCard({ headline: '大障害', achievement: '初動の達人' }),
      'linkedin',
    );
    expect(text).toContain('翌朝の新聞：「大障害」');
    expect(text).toContain('称号：初動の達人');
  });

  it('Xの上限が厳しいときは称号から落とし、見出しも切り詰める', () => {
    const text = buildPostText(
      makeCard({ headline: '障害対応の遅れを謝罪、原因は外部からの不正アクセスでした', achievement: '初動の達人' }),
      'x',
    );
    expect(charCount(text)).toBeLessThanOrEqual(PLATFORM_LIMITS.x);
    expect(text).toContain(SHARE_HASHTAG);
    expect(text).toContain('https://example.com/ytcdb');
  });

  it('英語では英語の雛形を使う', () => {
    const text = buildPostText(makeCard({ lang: 'en', title: 'Nebula Cloud', role: 'Executive' }), 'bluesky');
    expect(text).toContain('I played "Nebula Cloud" as Executive.');
    expect(text).toContain('Rank A');
    expect(text).toContain(SHARE_HASHTAG);
  });

  it('URLが未設定ならURLの行を出さない', () => {
    const text = buildPostText(makeCard({ url: '' }), 'threads');
    expect(text).not.toContain('https://');
    expect(text.endsWith('\n')).toBe(false);
    expect(charCount(text)).toBeLessThanOrEqual(PLATFORM_LIMITS.threads);
  });
});

describe('truncateText', () => {
  it('上限以内はそのまま、超えたら「…」を付ける', () => {
    expect(truncateText('abcdef', 6)).toBe('abcdef');
    expect(truncateText('abcdef', 5)).toBe('abcd…');
    expect(truncateText('abcdef', 0)).toBe('');
  });
});
