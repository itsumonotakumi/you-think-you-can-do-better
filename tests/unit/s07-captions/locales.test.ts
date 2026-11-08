import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const yamlSources = import.meta.glob<string>('/locales/*/ui/screens-c.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const screenSources = import.meta.glob<string>('/src/app/screens/S07Press.svelte', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const appSources = import.meta.glob<string>('/src/app/App.svelte', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

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

function load(lang: 'ja' | 'en'): Record<string, string> {
  const path = Object.keys(yamlSources).find((key) => key.includes(`/locales/${lang}/`));
  if (!path) throw new Error(`locale not found: ${lang}`);
  return flatten(parse(yamlSources[path] ?? ''));
}

function s07Source(): string {
  const text = Object.values(screenSources)[0];
  if (text === undefined) throw new Error('S07Press.svelte not found');
  return text;
}

const ja = load('ja');
const en = load('en');
const source = s07Source();

const CAPTION_KEYS = [
  'sc.press.caption.shutter',
  'sc.press.caption.fiveSeconds',
  'sc.press.caption.timeout',
];

describe('S07 字幕の文言（screens-c.yaml）', () => {
  it('日英で同じキーを持つ', () => {
    expect(Object.keys(ja).sort()).toEqual(Object.keys(en).sort());
  });

  it('シャッター音・残り5秒・時間切れの文言がある', () => {
    for (const key of CAPTION_KEYS) {
      expect(ja[key]?.trim(), `ja: ${key}`).toBeTruthy();
      expect(en[key]?.trim(), `en: ${key}`).toBeTruthy();
    }
  });

  it('画面のソースが同じキーを参照している', () => {
    for (const key of CAPTION_KEYS) expect(source).toContain(key);
  });
});

describe('S07 の字幕の部品', () => {
  it('字幕の表示は共通の親（App）に任せ、画面には置かない', () => {
    expect(source).not.toContain("import CaptionBar");
    expect(source).not.toContain('<CaptionBar />');
    expect(Object.values(appSources)[0] ?? '').toContain('<CaptionBar />');
  });

  it('字幕は store の待ち行列へ積む', () => {
    expect(source).toContain('enqueueCaptions(');
    expect(source).toContain('pressCaptionKinds(');
    expect(source).toContain("audio.playSe('press_timer')");
  });
});
