// レビュー指摘 #3・#6・#7・#8 の画面側の確認。
// DOM を持たない Vitest なので、画面はソースで確かめる（動作は E2E で見る）。
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { compile } from 'svelte/compiler';

const svelteSources = import.meta.glob<string>('/src/app/**/*.svelte', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;
const localeSources = import.meta.glob<string>('/locales/*/ui/ranking.yaml', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

function read(name: string): string {
  const found = Object.entries(svelteSources).find(([path]) => path.endsWith(`/${name}`));
  if (!found) throw new Error(`source not found: ${name}`);
  return found[1] ?? '';
}

function flatten(value: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'string') out[full] = child;
    else Object.assign(out, flatten(child, full));
  }
  return out;
}

const share = read('ShareButton.svelte');
const ending = read('S08Ending.svelte');
const ranking = read('S12Ranking.svelte');
const achievements = read('S13Achievements.svelte');

function locales(lang: 'ja' | 'en'): Record<string, string> {
  const key = Object.keys(localeSources).find((path) => path.includes(`/locales/${lang}/`));
  if (!key) throw new Error(`locale not found: ${lang}`);
  return flatten(parse(localeSources[key] ?? ''));
}

describe('シェアの見出しと称号（#3）', () => {
  it('シェア側も共通の headlineFor で見出しを作る', () => {
    expect(share).toContain("import { headlineFor } from '../headline'");
    expect(share).toContain('headlineFor(playState, scenario)');
    expect(share).not.toContain('scenario.headlines?.[result.rank]');
  });

  it('結果画面は見出しと代表の称号をシェアへ渡す', () => {
    expect(ending).toContain('representativeTitle');
    expect(ending).toContain('headlineFor');
    expect(ending).toContain('headline={shareHeadline}');
    expect(ending).toContain('achievement={shareTitle}');
  });
});

describe('モーダル表示（#6）', () => {
  it('シェア画面は showModal で開き、閉じたら起動ボタンへ戻す', () => {
    expect(share).toContain('panelEl?.open) panelEl.close()');
    expect(share).toContain('panelEl.showModal()');
    expect(share).toContain('openButton?.focus()');
    // div + aria-modal だけでは背面の操作を止められない
    expect(share).not.toContain('<div class="share-panel"');
  });

  it('称号画面は showModal で開き、閉じたら元の要素へ戻す', () => {
    expect(achievements).toContain('dialogEl.showModal()');
    expect(achievements).toContain('opener?.focus()');
    expect(achievements).not.toContain('<dialog open');
  });

  it('どちらも Svelte としてコンパイルできる', () => {
    const targets: [string, string][] = [
      ['ShareButton', share],
      ['S13Achievements', achievements],
    ];
    for (const [name, source] of targets) {
      const result = compile(source, { filename: `${name}.svelte`, generate: 'client' });
      expect(result.js.code.length, name).toBeGreaterThan(0);
    }
  });
});

describe('ランキングの難易度（#7）', () => {
  it('難易度は独立した状態で、表示と切り替えがある', () => {
    expect(ranking).toContain("let mode = $state<PlayMode>");
    expect(ranking).toContain("mode = 'hard'");
    expect(ranking).toContain("mode = 'normal'");
    expect(ranking).toContain("t('rk.mode')");
    expect(ranking).toContain("t('rk.modeNormal')");
    expect(ranking).toContain("t('rk.modeHard')");
    expect(ranking).not.toContain('const mode = $derived(');
  });

  it('難易度の文言が日英そろっている', () => {
    const ja = locales('ja');
    const en = locales('en');
    for (const key of ['rk.mode', 'rk.modeNormal', 'rk.modeHard']) {
      expect(ja[key]?.trim().length, `ja: ${key}`).toBeGreaterThan(0);
      expect(en[key]?.trim().length, `en: ${key}`).toBeGreaterThan(0);
    }
  });
});

describe('ランキング無効時の通信（#8）', () => {
  it('onMount の先頭で有効判定をしてから読み込む', () => {
    const start = ranking.indexOf('onMount(() => {');
    expect(start).toBeGreaterThanOrEqual(0);
    const body = ranking.slice(start, start + 700);
    expect(body).toContain('if (!enabled) return;');
    const guard = body.indexOf('if (!enabled) return;');
    const load = body.indexOf('loadIndex()');
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(load).toBeGreaterThan(guard);
  });
});
