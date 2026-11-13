// シェア機能のテスト用データ。担当: f-share。
import type { EndingResult, Scenario } from '../../../src/engine/types';
import { SHARE_HASHTAG, type ShareCard } from '../../../src/app/share/data';

export function makeCard(overrides: Partial<ShareCard> = {}): ShareCard {
  return {
    lang: 'ja',
    scenarioId: 'no01-nebula',
    title: 'ネビュラクラウド',
    role: '経営者',
    rank: 'A',
    score: 880,
    playCount: 2,
    product: 'じゃ、あなたがやってみて',
    url: 'https://example.com/ytcdb',
    hashtag: SHARE_HASHTAG,
    illustrationUrl: './illustrations/no01-nebula-key.webp',
    ...overrides,
  };
}

export function makeScenario(): Scenario {
  return {
    id: 'no01-nebula',
    title: { ja: 'ネビュラクラウド', en: 'Nebula Cloud' },
    headlines: {
      A: { ja: '翌朝の見出し', en: 'Morning headline' },
      B: { ja: '', en: '' },
    },
  } as unknown as Scenario;
}

export function makeResult(overrides: Partial<EndingResult> = {}): EndingResult {
  return {
    raw: 800,
    multiplier: 1,
    official: 800,
    rank: 'A',
    sales: 90,
    fatal: false,
    playCount: 2,
    ...overrides,
  };
}
