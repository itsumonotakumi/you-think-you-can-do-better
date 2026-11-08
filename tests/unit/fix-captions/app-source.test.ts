import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const svelteSources = import.meta.glob<string>('../../../src/app/**/*.svelte', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;
const localeSources = import.meta.glob<string>('/locales/*/ui/screens-b.yaml', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

function read(name: string): string {
  const found = Object.entries(svelteSources).find(([path]) => path.endsWith(name));
  if (!found) throw new Error(`source not found: ${name}`);
  return found[1] ?? '';
}

const app = read('/App.svelte');
const screens = {
  S05: read('/screens/S05Main.svelte'),
  S06: read('/screens/S06Draft.svelte'),
  S07: read('/screens/S07Press.svelte'),
  S08: read('/screens/S08Ending.svelte'),
  S09: read('/screens/S09Review.svelte'),
};

function flatten(value: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  if (!value || typeof value !== 'object') return out;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'string') out[full] = child;
    else Object.assign(out, flatten(child, full));
  }
  return out;
}

function locale(lang: 'ja' | 'en'): Record<string, string> {
  const path = Object.keys(localeSources).find((key) => key.includes(`/locales/${lang}/`));
  if (!path) throw new Error(`locale not found: ${lang}`);
  return flatten(parse(localeSources[path] ?? ''));
}

describe('字幕の表示は共通の親（App.svelte）が持つ', () => {
  it('App が字幕の部品と履歴を出す', () => {
    expect(app).toContain("import CaptionBar from './parts/CaptionBar.svelte'");
    expect(app).toContain('<CaptionBar />');
    expect(app).toContain('showsCaptions($screen)');
  });

  it('どの画面にも個別の字幕表示を置かない（重複させない）', () => {
    for (const [name, source] of Object.entries(screens)) {
      expect(source, name).not.toContain('<CaptionBar');
      expect(source, name).not.toContain("parts/CaptionBar.svelte");
    }
  });

  it('字幕を出さない画面では表示済みとして消費しない', () => {
    const gate = app.indexOf('if (!captionVisible) return;');
    const consume = app.indexOf('advanceCaption(');
    expect(gate).toBeGreaterThan(-1);
    expect(consume).toBeGreaterThan(-1);
    // 画面の判定が、待ち行列を進めるより先に来る
    expect(gate).toBeLessThan(consume);
    // 待ち行列を進めるのは、その判定の後ろ（同じ effect の中）
    expect(app.slice(gate, consume)).toContain('$captions[0]');
  });
});

describe('S05 からタイトルへ戻る導線', () => {
  const s05 = screens.S05;

  it('上部に中断のボタンを置く', () => {
    expect(s05).toContain("t('sb.main.abort.button')");
    expect(s05.indexOf('abort')).toBeLessThan(s05.indexOf('<TopBar'));
  });

  it('確認ダイアログを出し、続ける方に焦点を置く', () => {
    expect(s05).toContain('role="dialog"');
    expect(s05).toContain('aria-modal="true"');
    expect(s05).toContain("t('sb.main.abort.heading')");
    expect(s05).toContain("t('sb.main.abort.cancel')");
    expect(s05).toContain("t('sb.main.abort.confirm')");
    expect(s05).toContain('cancelButton?.focus()');
  });

  it('確認したときだけタイトルへ戻り、進行は保存したまま残す', () => {
    const fn = s05.slice(s05.indexOf('function abortToTitle'), s05.indexOf('</script>'));
    expect(fn).toContain('saveProgress(');
    expect(fn).toContain("screen.set('S01')");
    expect(fn).not.toContain('saveProgress(null)');
  });

  it('確認中は数字キーで選択肢を選ばない', () => {
    expect(s05).toMatch(/if \(abortOpen\) \{[\s\S]*?return;/);
  });
});

describe('中止の確認の文言', () => {
  const keys = [
    'sb.main.abort.button',
    'sb.main.abort.heading',
    'sb.main.abort.message',
    'sb.main.abort.confirm',
    'sb.main.abort.cancel',
    'sb.caption.history',
  ];

  it('日英の両方に同じキーがある', () => {
    const ja = locale('ja');
    const en = locale('en');
    for (const key of keys) {
      expect(ja[key]?.trim(), `ja: ${key}`).toBeTruthy();
      expect(en[key]?.trim(), `en: ${key}`).toBeTruthy();
    }
    expect(Object.keys(ja).sort()).toEqual(Object.keys(en).sort());
  });
});
