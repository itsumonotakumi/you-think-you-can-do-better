// ランキングの新しい文言（#7）。日英で同じキーを持ち、注意書きが両方にある。
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { RANKING_KEYS } from '../../../src/app/ranking/i18n';

const yamlSources = import.meta.glob<string>('/locales/*/ui/ranking.yaml', {
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

const ja = load('ja');
const en = load('en');

describe('ランキングの文言', () => {
  it('日英で同じキーを持つ', () => {
    expect(Object.keys(ja).sort()).toEqual(Object.keys(en).sort());
  });

  it('注意書きは本名・会社名・メール・電話を名指しする', () => {
    expect(ja[RANKING_KEYS.nicknameWarning]).toContain('本名');
    expect(ja[RANKING_KEYS.nicknameWarning]).toContain('社名');
    expect(ja[RANKING_KEYS.nicknameWarning]).toContain('メールアドレス');
    expect(ja[RANKING_KEYS.nicknameWarning]).toContain('電話番号');
    expect(ja[RANKING_KEYS.nicknameWarning]).toContain('誰でも見られます');
    expect(en[RANKING_KEYS.nicknameWarning]).toContain('real name');
    expect(en[RANKING_KEYS.nicknameWarning]).toContain('visible to everyone');
  });

  it('自動登録と後から削除できることを書く', () => {
    expect(ja[RANKING_KEYS.autoNotice]).toContain('シナリオ・ロール・選んだ選択肢・ニックネーム');
    expect(ja[RANKING_KEYS.autoNotice]).toContain('自動でランキングに登録');
    expect(ja[RANKING_KEYS.autoNotice]).toContain('後で削除できます');
    expect(en[RANKING_KEYS.autoNotice]).toContain('automatically registered');
    expect(en[RANKING_KEYS.autoNotice]).toContain('delete your record later');
  });

  it('参加しない設定と削除・キャッシュの説明がある', () => {
    expect(ja[RANKING_KEYS.optOutLabel]).toContain('ランキングに参加しない');
    expect(ja['rk.delete.cache']).toContain('最大5分');
    expect(ja['rk.delete.confirm']).toContain('元に戻せません');
    expect(ja['rk.delete.noKey']).toContain('削除用の鍵');
    expect(en['rk.delete.cache']).toContain('5 minutes');
  });

  it('画面が使うキーがそろっている', () => {
    for (const key of Object.values(RANKING_KEYS)) {
      expect(ja[key], `ja: ${key}`).toBeDefined();
      expect(en[key], `en: ${key}`).toBeDefined();
    }
    for (const key of ['rk.status.waiting', 'rk.status.retry', 'rk.nickname.required']) {
      expect(ja[key], `ja: ${key}`).toBeDefined();
      expect(en[key], `en: ${key}`).toBeDefined();
    }
  });
});
