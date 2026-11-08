// 不具合修正の再現テスト: 文案の遅延効果の原因は「文案を開いた選択肢」。
import { describe, it, expect } from 'vitest';
import { startPlay } from '../../../src/engine/state';
import { choose, submitDraft } from '../../../src/engine/choices';
import { finalizeBeforeEnding } from '../../../src/engine/deadlines';
import { buildReport } from '../../../src/engine/report';
import { fixture, fixtureRefs } from '../../fixtures/scenario';

function runDetail(): ReturnType<typeof startPlay> {
  let r = startPlay(fixture, 'executive', 2, { comment: '', predictedHours: null }, '2026-11-08T00:00:00Z', fixtureRefs);
  r = choose(r.state, fixture, 'wipe');
  r = choose(r.state, fixture, 'escalate');
  r = choose(r.state, fixture, 'publish'); // 文案 draft1 を開く
  return submitDraft(r.state, fixture, { scope: 's-current' }); // 遅延効果つきの部品を選ぶ
}

describe('文案の遅延効果の出どころ', () => {
  it('原因の選択肢IDを sourceChoiceId に保存する', () => {
    const r = runDetail();
    const effect = r.state.delayed.find((d) => d.sourcePointId === 'p3');
    expect(effect?.sourceChoiceId).toBe('publish');
  });

  it('振り返りで、選んだ選択肢に遅延の減点が結び付く', () => {
    const fin = finalizeBeforeEnding(runDetail().state, fixture);
    const entry = buildReport(fin, fixture).entries.find((e) => e.choiceId === 'publish');
    expect(entry?.delayedHits).toEqual([
      { reason: { ja: '訂正が必要', en: 'EN:訂正が必要' }, points: -20 },
    ]);
  });
});
