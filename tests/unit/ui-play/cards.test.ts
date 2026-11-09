import { describe, expect, it } from 'vitest';

const svelteSources = import.meta.glob<string>('../../../src/app/**/*.svelte', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

function read(name: string): string {
  const found = Object.entries(svelteSources).find(([path]) => path.endsWith(name));
  if (!found) throw new Error(`source not found: ${name}`);
  return found[1] ?? '';
}

describe('カードの色分け', () => {
  it('問題文・通知・報告書が、種類ごとの色の変数を使う', () => {
    const s05 = read('/screens/S05Main.svelte');
    expect(s05).toContain('var(--card-question)');
    expect(s05).toContain('var(--card-question-line)');
    expect(s05).toContain('var(--card-notice)');

    const s06 = read('/screens/S06Draft.svelte');
    expect(s06).toContain('var(--card-report)');
    expect(s06).toContain('var(--card-report-line)');
  });

  it('声は媒体ごとに色を変える（boss は電話、vendor はメール）', () => {
    const voiceList = read('/parts/VoiceList.svelte');
    const mapping: Record<string, string> = {
      sns: '--card-sns',
      news: '--card-news',
      board: '--card-board',
      chat: '--card-chat',
      boss: '--card-phone',
      vendor: '--card-mail',
      attacker: '--card-attacker',
    };
    for (const [media, variable] of Object.entries(mapping)) {
      const rule = voiceList.slice(voiceList.indexOf(`data-media='${media}'`));
      expect(rule.slice(0, 160), media).toContain(`var(${variable})`);
    }
  });

  it('色だけに頼らず、声の媒体名を文字でも出す', () => {
    expect(read('/parts/VoiceList.svelte')).toContain('mediaLabelKey(voice.media');
  });
});
