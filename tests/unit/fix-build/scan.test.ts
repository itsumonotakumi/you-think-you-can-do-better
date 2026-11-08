import { describe, it, expect, afterEach } from 'vitest';
import { validateFixture } from '../validate/helpers.ts';
import type { TestFiles, ValidatedProject } from '../validate/helpers.ts';

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

type Deny = NonNullable<TestFiles['denylist']>;

function deny(overrides: Partial<Deny> = {}): Deny {
  return {
    companies: [],
    services: [],
    people: [],
    countries: [],
    comparisons: [],
    ...overrides,
  };
}

function run(mutate: (files: TestFiles) => void): ValidatedProject {
  const project = validateFixture(mutate);
  cleanups.push(project.cleanup);
  return project;
}

function audioAsset(author = '作者', title = 'クリック'): Record<string, unknown> {
  return {
    id: 'click',
    kind: 'se',
    file: 'se/click.mp3',
    loop: false,
    title,
    author,
    site: '配布サイト',
    url: 'https://example.com/click',
    termsUrl: 'https://example.com/terms',
    termsCheckedAt: '2026-11-01',
    conditions: {
      game: true,
      free: true,
      modify: true,
      creditRequired: true,
      creditText: author,
      themeOk: true,
      redistribution: 'embedded-only',
    },
  };
}

function withAudio(author = '作者', title = 'クリック'): (files: TestFiles) => void {
  return (files) => {
    files.audioManifest = [audioAsset(author, title)];
    files.audioFiles = ['se/click.mp3'];
  };
}

describe('C16 の走査範囲', () => {
  it('locales の notices を見る', () => {
    const project = run((files) => {
      files.denylist = deny({ companies: ['GMO'] });
      files.notices.ja.criminal = 'GMO が攻撃した';
    });
    expect(project.result.errors.some((e) => e.code === 'C16')).toBe(true);
  });

  it('locales の ui を見る（NFKC・全角）', () => {
    const project = run((files) => {
      files.denylist = deny({ companies: ['GMO'] });
      files.ui.ja!.common!['extra.one'] = 'ＧＭＯ の事件';
    });
    expect(project.result.errors.some((e) => e.code === 'C16')).toBe(true);
  });

  it('ゼロ幅文字を除いて照合する', () => {
    const project = run((files) => {
      files.denylist = deny({ companies: ['GMO'] });
      files.ui.ja!.common!['extra.one'] = 'G\u200bM\u200dO';
    });
    expect(project.result.errors.some((e) => e.code === 'C16')).toBe(true);
  });

  it('空白を除いて照合する', () => {
    const project = run((files) => {
      files.denylist = deny({ companies: ['GMO'] });
      files.scenario.tagline = { ja: 'G M O', en: 'x' };
    });
    expect(project.result.errors.some((e) => e.code === 'C16')).toBe(true);
  });

  it('audio-manifest を見る', () => {
    const project = run((files) => {
      files.denylist = deny({ companies: ['GMO'] });
      withAudio('作者', 'GMO の音')(files);
    });
    expect(project.result.errors.some((e) => e.code === 'C16')).toBe(true);
  });

  it('クレジットの作者名は対象外', () => {
    const project = run((files) => {
      files.denylist = deny({ companies: ['GMO'] });
      withAudio('GMO', 'クリック')(files);
    });
    expect(project.result.errors.some((e) => e.code === 'C16')).toBe(false);
  });
});

describe('C20 の走査範囲', () => {
  it('locales の ui を見る（NFKC・ゼロ幅・空白）', () => {
    const project = run((files) => {
      files.denylist = deny({ comparisons: ['社より(?:も)?(?:早|遅|まし|ひど)'] });
      files.ui.ja!.common!['extra.one'] = '他\u200b社 よりも 早い';
    });
    expect(project.result.errors.some((e) => e.code === 'C20')).toBe(true);
  });

  it('notices を見る', () => {
    const project = run((files) => {
      files.denylist = deny({ comparisons: ['社より(?:も)?(?:早|遅|まし|ひど)'] });
      files.notices.ja.fiction = '他社よりひどい';
    });
    expect(project.result.errors.some((e) => e.code === 'C20')).toBe(true);
  });
});

describe('C17（HTML）の走査範囲', () => {
  it('locales の ui を見る', () => {
    const project = run((files) => {
      files.ui.ja!.common!['extra.one'] = '<b>強調</b>';
    });
    expect(project.result.errors.some((e) => e.code === 'C17')).toBe(true);
  });

  it('notices を見る', () => {
    const project = run((files) => {
      files.notices.ja.fiction = '<i>フィクション</i>';
    });
    expect(project.result.errors.some((e) => e.code === 'C17')).toBe(true);
  });

  it('audio-manifest を見る', () => {
    const project = run((files) => {
      withAudio('作者', '<b>クリック</b>')(files);
    });
    expect(project.result.errors.some((e) => e.code === 'C17')).toBe(true);
  });
});
