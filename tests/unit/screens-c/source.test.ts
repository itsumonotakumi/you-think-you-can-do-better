import { describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';

// 実行時 DOM は使わず、Svelte コンパイルと記法・要件の静的な確認をする
const screenSources = import.meta.glob<string>('/src/app/screens/*.svelte', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const ownScreens = ['S07Press', 'S08Ending', 'S09Review'] as const;

function source(name: (typeof ownScreens)[number]): string {
  const key = `/src/app/screens/${name}.svelte`;
  const text = screenSources[key];
  if (text === undefined) throw new Error(`missing ${key}`);
  return text;
}

const s07 = source('S07Press');
const s08 = source('S08Ending');
const s09 = source('S09Review');
const all = [s07, s08, s09];

const FORBIDDEN: { name: string; pattern: RegExp }[] = [
  { name: '{@html}', pattern: /\{@html\b/ },
  { name: 'export let', pattern: /\bexport\s+let\b/ },
  { name: 'on: ディレクティブ', pattern: /\son:[a-z]+/ },
  { name: '旧 $: リアクティブ', pattern: /(^|\n)\s*\$:/ },
  { name: 'Math.random', pattern: /\bMath\.random\b/ },
  { name: 'Date.now', pattern: /\bDate\.now\b/ },
  { name: 'eval', pattern: /\beval\s*\(/ },
  { name: 'new Function', pattern: /\bnew\s+Function\b/ },
  { name: '外部通信', pattern: /\b(fetch|XMLHttpRequest|WebSocket)\b/ },
  { name: 'ブラウザ保存の直接利用', pattern: /\b(localStorage|sessionStorage)\b/ },
];

describe('S07 / S08 / S09 の安全・作法', () => {
  for (const rule of FORBIDDEN) {
    it(`${rule.name} を使っていない`, () => {
      for (const text of all) expect(text).not.toMatch(rule.pattern);
    });
  }

  it('Svelte 5 の runes を使っている', () => {
    for (const text of all) expect(text).toMatch(/\$state|\$derived/);
  });

  it('担当画面に data-screen がある', () => {
    expect(s07).toContain('data-screen="S07Press"');
    expect(s08).toContain('data-screen="S08Ending"');
    expect(s09).toContain('data-screen="S09Review"');
  });

  it('3画面ともコンパイルできる', () => {
    for (const name of ownScreens) {
      const result = compile(source(name), { filename: `${name}.svelte`, generate: 'client' });
      expect(result.js.code.length).toBeGreaterThan(0);
    }
  });
});

describe('S07 記者会見', () => {
  it('質問を1問ずつ、残り秒数を現実の時間で数える', () => {
    expect(s07).toContain('pressSeconds');
    expect(s07).toContain('setInterval');
    expect(s07).toContain('performance.now()');
    expect(s07).toContain('pressTimeScale');
    expect(s07).toContain('DEFAULT_PRESS_SECONDS = 30');
  });

  it('背面に回ったら止める', () => {
    expect(s07).toContain("addEventListener('visibilitychange'");
    expect(s07).toContain('document.hidden');
    expect(s07).toContain('lastTick = null');
  });

  it('残り5秒で press_timer、時間切れで null の回答', () => {
    expect(s07).toContain('PRESS_WARN_SECONDS = 5');
    expect(s07).toContain("audio.playSe('press_timer')");
    expect(s07).toMatch(/answerPress\(state, current, (answerId|null)(?:, [^)]+)?\)/);
    expect(s07).toContain('choose(null)');
  });

  it('記録を開いても数え続ける', () => {
    expect(s07).toContain('notesOpen = !notesOpen');
    expect(s07).toContain('sc.press.notesHint');
    expect(s07).toContain('sc.press.hiddenAnswers');
  });

  it('演出キューを audio と effects に渡す', () => {
    expect(s07).toContain('audio.runCues(');
    expect(s07).toContain('runFxCues(');
    expect(s07).toContain('$settings.reduceMotion');
    expect(s07).toContain('claimCues(');
  });

  it('回答できる選択肢だけを出す', () => {
    expect(s07).toContain('availableAnswers(');
  });
});

describe('S08 エンディング', () => {
  it('n回目・ランク・素点・係数・公式スコア・売上見通しを出す', () => {
    for (const key of [
      'sc.playCount', 'sc.ending.rank', 'sc.ending.raw', 'sc.ending.multiplier',
      'sc.ending.official', 'sc.ending.sales',
    ]) {
      expect(s08).toContain(key);
    }
    expect(s08).toContain('computeResult(');
    expect(s08).toContain('result.sales');
  });

  it('売上見通しが架空だと添える', () => {
    expect(s08).toContain('sc.ending.salesNote');
  });

  it('ランクのスタンプと音、ランク別BGMを出す', () => {
    expect(s08).toContain("runFx('stamp')");
    expect(s08).toContain("audio.playSe('stamp')");
    expect(s08).toContain('current.endings[value.rank].bgm');
    expect(s08).toContain('data-fx="stamp"');
  });

  it('プロローグの批判コメントと対比する', () => {
    expect(s08).toContain('sc.ending.prologueHeading');
    expect(s08).toContain('prologue.comment');
    expect(s08).toContain('sc.ending.predicted');
    expect(s08).toContain('sc.ending.compareNote');
  });

  it('注記を出し、2回目以降は replay を出す', () => {
    expect(s08).toContain("notice('criminal')");
    expect(s08).toContain("notice('score')");
    expect(s08).toContain("notice('replay')");
    expect(s08).toContain('result.playCount >= 2');
  });

  it('結果を一度だけ記録し、進行中データを閉じる', () => {
    expect(s08.match(/recordResult\(/g)).toHaveLength(1);
    expect(s08).toContain('saveProgress(null)');
    expect(s08).toContain('recorded = true');
  });
});

describe('S09 振り返り', () => {
  it('各判断・方針点・細目点を出す', () => {
    expect(s09).toContain('buildReport(');
    expect(s09).toContain('sc.review.policyPoints');
    expect(s09).toContain('sc.review.itemPoints');
    expect(s09).toContain('formatClock(');
    expect(s09).toContain('sc.playCount');
  });

  it('根拠を loadReferences で引く', () => {
    expect(s09).toContain('loadReferences(');
    expect(s09).toContain('ref.title');
    expect(s09).toContain('ref.issuer');
  });

  it('取れた／取りこぼした細目を出す', () => {
    expect(s09).toContain('report.itemsEarned');
    expect(s09).toContain('report.itemsMissed');
    expect(s09).toContain('sc.review.ifChosen');
  });

  it('誘導の声だけをここで明かす', () => {
    expect(s09).toContain('moved.misleading');
    expect(s09).toContain('sc.review.movedHeading');
    expect(s09).toContain('typeLabelKey');
  });

  it('遅れて来た効果を出す', () => {
    expect(s09).toContain('entry.delayedHits');
    expect(s09).toContain('sc.review.delayedHeading');
  });

  it('注記とタイトルへ戻るボタン、印刷を用意する', () => {
    expect(s09).toContain("notice('criminal')");
    expect(s09).toContain("notice('score')");
    expect(s09).toContain("notice('voices')");
    expect(s09).toContain("screen.set('S01')");
    expect(s09).toContain('window.print()');
    expect(s09).toContain('@media print');
  });
});
