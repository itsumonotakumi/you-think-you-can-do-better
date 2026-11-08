import { describe, expect, it } from 'vitest';

// Node の型に依存しないよう、Vite の raw import でソースを読む
const svelteSources = import.meta.glob<string>('../../../src/app/**/*.svelte', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;
const logicSources = import.meta.glob<string>('../../../src/app/parts/logic.ts', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

function read(name: string): string {
  const found = Object.entries(svelteSources).find(([path]) => path.endsWith(name));
  if (!found) throw new Error(`source not found: ${name}`);
  return found[1] ?? '';
}

const s05 = read('/screens/S05Main.svelte');
const s06 = read('/screens/S06Draft.svelte');
const partNames = [
  'CaptionBar.svelte', 'ChoiceList.svelte', 'DraftSlots.svelte', 'NotePanel.svelte',
  'TopBar.svelte', 'Typewriter.svelte', 'VoiceList.svelte',
];
const parts = partNames.map((name) => read(`/parts/${name}`));
const logic = Object.values(logicSources)[0] ?? '';
const all = [s05, s06, ...parts, logic];

const FORBIDDEN: { name: string; pattern: RegExp }[] = [
  { name: '{@html}', pattern: /\{@html\}/ },
  { name: 'export let', pattern: /\bexport\s+let\b/ },
  { name: 'on: ディレクティブ', pattern: /\son:[a-z]+/ },
  { name: '旧 $: リアクティブ', pattern: /(^|\n)\s*\$:/ },
  { name: 'Math.random', pattern: /Math\.random/ },
  { name: 'Date.now', pattern: /Date\.now/ },
  { name: 'eval', pattern: /\beval\s*\(/ },
  { name: 'new Function', pattern: /new\s+Function/ },
  { name: '外部通信', pattern: /\b(fetch|XMLHttpRequest|WebSocket)\b/ },
  { name: 'ブラウザ保存の直接利用', pattern: /\b(localStorage|sessionStorage)\b/ },
];

describe('S05 / S06 の安全・作法', () => {
  for (const rule of FORBIDDEN) {
    it(`${rule.name} を使っていない`, () => {
      for (const source of all) expect(source).not.toMatch(rule.pattern);
    });
  }

  it('Svelte 5 の runes を使っている', () => {
    expect(s05).toMatch(/\$state|\$derived/);
    expect(s06).toMatch(/\$state|\$derived/);
    expect(read('/parts/TopBar.svelte')).toMatch(/\$props\(\)/);
    expect(read('/parts/Typewriter.svelte')).toMatch(/\$props\(\)/);
  });
});

describe('S05 の要件', () => {
  it('上部バー・状況・選択肢・声・記録を組み立てる（字幕は App が持つ）', () => {
    for (const name of ['TopBar', 'Typewriter', 'ChoiceList', 'VoiceList', 'NotePanel']) {
      expect(s05).toContain(name);
    }
    expect(s05).not.toContain('<CaptionBar');
  });

  it('演出キューを audio と effects に渡す', () => {
    expect(s05).toContain('audio.runCues(');
    expect(s05).toContain('runFxCues(');
    expect(s05).toContain('$settings.reduceMotion');
  });

  it('選択の確定ごとに保存する', () => {
    expect(s05).toContain('saveProgress(');
    expect(s06).toContain('saveProgress(');
  });

  it('press の前に startPress を呼ぶ', () => {
    expect(s05).toContain("result.next === 'press'");
    expect(s05).toContain('startPress(');
  });

  it('数字キーで選べる', () => {
    expect(s05).toContain('choiceIndexFromKey');
    expect(read('/parts/ChoiceList.svelte')).toContain('aria-keyshortcuts');
  });

  it('初回の声で notice を出す', () => {
    expect(s05).toContain("notice('voices')");
  });

  it('640px 未満で声と記録をタブにする', () => {
    expect(s05).toMatch(/@media \(max-width: 639px\)/);
    expect(s05).toContain("tab = 'voices'");
    expect(s05).toContain("tab = 'notes'");
  });
});

describe('部品の要件', () => {
  it('ゲージは数値と文字を出す', () => {
    const topBar = read('/parts/TopBar.svelte');
    expect(topBar).toContain('gaugeViews');
    expect(topBar).toContain('<strong>');
    expect(topBar).toContain('t(g.levelKey)');
  });

  it('声は誘導かどうかで見た目を変えない', () => {
    expect(read('/parts/VoiceList.svelte')).not.toContain('misleading');
  });

  it('タイプ表示はクリックで全文になる', () => {
    const typewriter = read('/parts/Typewriter.svelte');
    expect(typewriter).toContain('onclick={reveal}');
    expect(typewriter).toContain('instant');
  });
});

describe('S06 の要件', () => {
  it('部品選択と組み上がった文を出し、submitDraft で確定する', () => {
    expect(s06).toContain('DraftSlots');
    expect(s06).toContain('composeDraft(');
    expect(s06).toContain('submitDraft(');
    expect(s06).toContain('startPress(');
    expect(s06).toContain('sb.draft.confirm');
  });
});
