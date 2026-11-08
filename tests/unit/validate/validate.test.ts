import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateFixture, createProject } from './helpers.ts';
import type { ValidatedProject } from './helpers.ts';
import { validateProject } from '../../../tools/validate/checks.ts';

const cleanups: (() => void)[] = [];

function run(mutate?: Parameters<typeof validateFixture>[0]): ValidatedProject {
  const project = validateFixture(mutate);
  cleanups.push(project.cleanup);
  return project;
}

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function errorCodes(project: ValidatedProject): string[] {
  return project.result.errors.map((issue) => issue.code);
}

describe('validate C01〜C10', () => {
  it('正常なプロジェクトはエラーなし', () => {
    const project = run();
    expect(project.result.errors.map((e) => `${e.file}:${e.line} [${e.code}] ${e.message}`)).toEqual([]);
  });

  it('C01 必須要素がない', () => {
    const project = run((files) => {
      delete files.scenario.version;
    });
    expect(errorCodes(project)).toContain('C01');
  });

  it('C02 判断ポイントが少ない', () => {
    const project = run((files) => {
      files.roles.executive.points.pop();
    });
    expect(errorCodes(project)).toContain('C02');
  });

  it('C02 経営者は18個まで', () => {
    const project = run((files) => {
      const template = files.roles.executive.points[0];
      for (let i = 15; i < 19; i += 1) {
        files.roles.executive.points.push({ ...template, id: `p-${i}` });
      }
    });
    expect(errorCodes(project)).toContain('C02');
  });

  it('C03 細目が80個未満', () => {
    const project = run((files) => {
      delete files.roles.executive.drafts;
    });
    expect(errorCodes(project)).toContain('C03');
  });

  it('C04 細目の点数が範囲外', () => {
    const project = run((files) => {
      files.roles.executive.points[0].choices[0].items[0].points = 0;
    });
    expect(errorCodes(project)).toContain('C04');
  });

  it('C04 のエラーはロールのファイルと行を指す', () => {
    const project = run((files) => {
      files.roles.executive.points[0].choices[0].items[0].points = 21;
    });
    const issue = project.result.errors.find((e) => e.code === 'C04');
    expect(issue?.file).toBe('scenarios/no04-goride/roles/executive.yaml');
    expect(issue?.line).toBeGreaterThan(1);
  });

  it('C05 点数区分の範囲外', () => {
    const project = run((files) => {
      files.roles.executive.points[0].choices[0].points = 100;
    });
    expect(errorCodes(project)).toContain('C05');
  });

  it('C06 根拠IDがない', () => {
    const project = run((files) => {
      files.roles.executive.points[0].choices[0].refs = ['missing-ref'];
    });
    expect(errorCodes(project)).toContain('C06');
  });

  it('C06 根拠IDが空', () => {
    const project = run((files) => {
      files.roles.executive.points[0].choices[1].refs = [];
    });
    expect(errorCodes(project)).toContain('C06');
  });

  it('C07 ミスリードの声がある判断ポイントが半数未満', () => {
    const project = run((files) => {
      for (const point of files.roles.executive.points) point.voices = [];
      files.roles.executive.points[0].voices = ['v-mis-0'];
    });
    expect(errorCodes(project)).toContain('C07');
  });

  it('C08 ミスリードの型が8種未満', () => {
    const project = run((files) => {
      for (const voice of files.roles.executive.voices) {
        if (voice.misleading) voice.type = 'public-opinion';
      }
    });
    expect(errorCodes(project)).toContain('C08');
  });

  it('C08 misleading の声に type がない', () => {
    const project = run((files) => {
      delete files.roles.executive.voices[0].type;
    });
    expect(errorCodes(project)).toContain('C08');
  });

  it('C09 臆病ゲージの声がない', () => {
    const project = run((files) => {
      files.roles.executive.cowardVoices['2'] = 'v-nope';
    });
    expect(errorCodes(project)).toContain('C09');
  });

  it('C10 正しい選択の直後の批判がない', () => {
    const project = run((files) => {
      files.roles.executive.voices = files.roles.executive.voices.filter((v: { id: string }) => v.id !== 'v-after');
    });
    expect(errorCodes(project)).toContain('C10');
  });
});

describe('validate C14〜C22', () => {
  it('C14 宣言した言語の文言がない', () => {
    const project = run((files) => {
      files.scenario.languages = ['ja', 'en'];
      delete files.scenario.title.en;
    });
    expect(errorCodes(project)).toContain('C14');
  });

  it('C14 宣言していない言語は検査しない', () => {
    const project = run((files) => {
      delete files.scenario.title.en;
    });
    expect(errorCodes(project)).not.toContain('C14');
  });

  it('C15 根拠データに期限がない', () => {
    const project = run((files) => {
      delete files.references[1]!.deadlineHours;
    });
    expect(errorCodes(project)).toContain('C15');
  });

  it('C15 期限の時間を直接書いている', () => {
    const project = run((files) => {
      files.roles.executive.deadlines[0].hours = 72;
    });
    expect(errorCodes(project)).toContain('C15');
  });

  it('C16 禁止リストの語が入っている', () => {
    const project = run((files) => {
      files.denylist = { companies: ['ゴーライド'] };
    });
    expect(errorCodes(project)).toContain('C16');
  });

  it('C17 YAML の構文エラー', () => {
    const project = createProject();
    cleanups.push(project.cleanup);
    writeFileSync(join(project.root, 'scenarios', 'no04-goride', 'scenario.yaml'), 'id: [1\n');
    const result = validateProject({ root: project.root, today: '2026-11-08' });
    expect(result.errors.map((e) => e.code)).toContain('C17');
    expect(result.errors.some((e) => e.code === 'C17' && e.file.endsWith('scenario.yaml'))).toBe(true);
  });

  it('C17 UI 文言のキーがファイル間で重複', () => {
    const project = run((files) => {
      files.ui['ja']!.extra = { 'title.start': '重複' };
    });
    expect(errorCodes(project)).toContain('C17');
  });

  it('C17 文章中の HTML', () => {
    const project = run((files) => {
      files.scenario.tagline = { ja: '<b>強調</b>', en: 'bold' };
    });
    expect(errorCodes(project)).toContain('C17');
  });

  it('C18 見積もりが2倍以上ずれたら警告だけ', () => {
    const project = run((files) => {
      files.roles.executive.estimateMinutes = 100;
    });
    expect(project.result.errors).toEqual([]);
    expect(project.result.warnings.map((w) => w.code)).toContain('C18');
  });

  it('C19 犯罪者の注記がない', () => {
    const project = run((files) => {
      delete files.notices.ja.criminal;
    });
    expect(errorCodes(project)).toContain('C19');
  });

  it('C20 実在企業との比較表現', () => {
    const project = run((files) => {
      files.denylist = { comparisons: ['社より(?:も)?(?:早|遅|まし|ひど)'] };
      files.scenario.tagline = { ja: '他社よりも早い', en: 'faster' };
    });
    expect(errorCodes(project)).toContain('C20');
  });

  it('C21 高得点の注記がない', () => {
    const project = run((files) => {
      delete files.notices.ja.score;
    });
    expect(errorCodes(project)).toContain('C21');
  });

  it('C22 正しい manifest は通る', () => {
    const project = run((files) => {
      files.audioManifest = [audioAsset()];
      files.audioFiles = ['se/click.mp3'];
    });
    expect(project.result.errors).toEqual([]);
  });

  it('C22 manifest にあるファイルがない', () => {
    const project = run((files) => {
      files.audioManifest = [audioAsset()];
      files.audioFiles = ['se/other.mp3'];
    });
    expect(errorCodes(project)).toContain('C22');
  });

  it('C22 manifest にないファイルがある', () => {
    const project = run((files) => {
      files.audioManifest = [];
      files.audioFiles = ['se/click.mp3'];
    });
    expect(errorCodes(project)).toContain('C22');
  });

  it('C22 利用条件が true でない', () => {
    const project = run((files) => {
      const asset = audioAsset();
      asset.conditions.game = false;
      files.audioManifest = [asset];
      files.audioFiles = ['se/click.mp3'];
    });
    expect(errorCodes(project)).toContain('C22');
  });

  it('C22 規約の確認日が1年以上前', () => {
    const project = run((files) => {
      const asset = audioAsset();
      asset.termsCheckedAt = '2024-01-01';
      files.audioManifest = [asset];
      files.audioFiles = ['se/click.mp3'];
    });
    expect(errorCodes(project)).toContain('C22');
  });
});

function audioAsset(): Record<string, any> {
  return {
    id: 'click',
    kind: 'se',
    file: 'se/click.mp3',
    loop: false,
    title: 'クリック',
    author: '作者',
    site: '配布サイト',
    url: 'https://example.com/click',
    termsUrl: 'https://example.com/terms',
    termsCheckedAt: '2026-11-01',
    conditions: {
      game: true,
      free: true,
      modify: true,
      creditRequired: false,
      creditText: '',
      themeOk: true,
      redistribution: 'embedded-only',
    },
  };
}
