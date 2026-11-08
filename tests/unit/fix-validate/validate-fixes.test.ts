// 検査ツールの不具合修正（C01・C11・C14・0件時・根拠ID重複）の確認。
import { describe, it, expect, afterEach } from 'vitest';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { validateFixture, createProject } from '../validate/helpers.ts';
import type { TestFiles, ValidatedProject } from '../validate/helpers.ts';
import { validateProject, checkC11 } from '../../../tools/validate/checks.ts';
import { loadProject } from '../../../tools/validate/project.ts';
import { fixture, fixtureRefs } from '../../fixtures/scenario.ts';
import type { Project } from '../../../tools/validate/project.ts';
import type { Scenario } from '../../../src/engine/types.ts';

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function run(mutate?: (files: TestFiles) => void): ValidatedProject {
  const project = validateFixture(mutate);
  cleanups.push(project.cleanup);
  return project;
}

function codes(project: ValidatedProject): string[] {
  return project.result.errors.map((issue) => issue.code);
}

function messages(project: ValidatedProject): string[] {
  return project.result.errors.map((issue) => issue.message);
}

describe('C01 trigger.flags が null', () => {
  it('例外を投げず、エラーを記録して検査を続ける', () => {
    const project = run((files) => {
      files.roles.executive.voices[0].trigger = { flags: null };
      delete files.scenario.version;
    });
    expect(codes(project)).toContain('C01');
    expect(messages(project).some((m) => m.includes('trigger.flags はオブジェクト'))).toBe(true);
    // 同じ検査の後続（version の欠け）も報告される
    expect(messages(project).some((m) => m.includes('version がない'))).toBe(true);
  });
});

describe('C01 when.flags の型', () => {
  it('判断ポイントの when.flags が真偽値でないとエラー', () => {
    const project = run((files) => {
      files.roles.executive.points[0].when = { flags: { invalid: 'true' } };
    });
    expect(codes(project)).toContain('C01');
    expect(messages(project).some((m) => m.includes('when.flags.invalid は true/false'))).toBe(true);
  });

  it('イベントの when.flags が真偽値でないとエラー', () => {
    const project = run((files) => {
      files.roles.executive.events = [
        { id: 'ev-test', at: { day: 0, minutes: 600 }, when: { flags: { opened: 1 } } },
      ];
    });
    expect(codes(project)).toContain('C01');
    expect(messages(project).some((m) => m.includes('when.flags.opened は true/false'))).toBe(true);
  });

  it('会見の extraQuestions の when.flags が真偽値でないとエラー', () => {
    const project = run((files) => {
      files.scenario.press = {
        questions: [
          {
            id: 'q-1',
            text: { ja: '質問', en: 'Q' },
            answers: [{ id: 'a-1', text: { ja: '回答', en: 'A' }, points: 0 }],
          },
        ],
        extraQuestions: [
          {
            when: { flags: { hidFacts: 'yes' } },
            question: {
              id: 'q-2',
              text: { ja: '追加', en: 'Extra' },
              answers: [{ id: 'a-2', text: { ja: '回答', en: 'A' }, points: 0 }],
            },
          },
        ],
      };
    });
    expect(codes(project)).toContain('C01');
    expect(messages(project).some((m) => m.includes('when.flags.hidFacts は true/false'))).toBe(true);
  });

  it('真偽値の when.flags は通る', () => {
    const project = run((files) => {
      files.roles.executive.points[0].when = { flags: { contained: true } };
    });
    expect(project.result.errors).toEqual([]);
  });
});

describe('文案の部品', () => {
  it('auto の items に when がないとエラー', () => {
    const project = run((files) => {
      delete files.roles.executive.drafts.draft1.slots[0].items[0].when;
    });
    expect(codes(project)).toContain('C01');
    expect(messages(project).some((m) => m.includes('自動の文案の部品は when が要る'))).toBe(true);
  });

  it('手動の options に text がないとエラー', () => {
    const project = run((files) => {
      const option = files.roles.executive.drafts.draft1.slots[1].options[0];
      delete option.text;
      option.when = { otherwise: true };
    });
    expect(codes(project)).toContain('C01');
    expect(messages(project).some((m) => m.includes('手動の文案の部品は text が要る'))).toBe(true);
  });
});

describe('C14 画面文言と注記の ja/en 比較', () => {
  it('en の UI 文言が欠けるとエラー', () => {
    const project = run((files) => {
      delete files.ui.en!.common!['title.start'];
    });
    expect(codes(project)).toContain('C14');
    expect(messages(project).some((m) => m.includes('文言がない: title.start（en）'))).toBe(true);
  });

  it('ja の UI 文言が欠けるとエラー', () => {
    const project = run((files) => {
      delete files.ui.ja!.common!['title.start'];
    });
    expect(codes(project)).toContain('C14');
    expect(messages(project).some((m) => m.includes('文言がない: title.start（ja）'))).toBe(true);
  });

  it('空文字の UI 文言はエラー', () => {
    const project = run((files) => {
      files.ui.en!.common!['title.start'] = '';
    });
    expect(codes(project)).toContain('C14');
    expect(messages(project).some((m) => m.includes('文言が空: title.start（en）'))).toBe(true);
  });

  it('en の注記が欠けるとエラー', () => {
    const project = run((files) => {
      delete files.notices.en!.score;
    });
    expect(codes(project)).toContain('C14');
    expect(messages(project).some((m) => m.includes('文言がない: score（en）'))).toBe(true);
  });
});

describe('シナリオが0件でも読み込みエラーと共通データを返す', () => {
  it('scenario.yaml の欠け（C17）と根拠データの誤り（C15）を返す', () => {
    const project = createProject((files) => {
      files.references[1]!.deadlineHours = -1;
    });
    cleanups.push(project.cleanup);
    rmSync(join(project.root, 'scenarios', project.files.scenario.id, 'scenario.yaml'), { force: true });

    const result = validateProject({ root: project.root, today: '2026-11-08' });
    expect(result.errors.map((issue) => issue.code)).toContain('C17');
    expect(result.errors.map((issue) => issue.code)).toContain('C15');
  });
});

describe('根拠IDの重複', () => {
  it('重複した根拠IDはエラーになり、検査は最初の定義を使う', () => {
    const project = createProject((files) => {
      files.references.push({ ...files.references[0], deadlineHours: 999 });
    });
    cleanups.push(project.cleanup);

    const loaded = loadProject({ root: project.root, today: '2026-11-08' });
    expect(loaded.loadIssues.some((issue) => issue.message.includes('根拠IDが重複: ref-a'))).toBe(true);
    // 期限の初期化と同じく、最初の定義（deadlineHours なし）を採用する
    expect(loaded.referencesById.get('ref-a')?.deadlineHours).toBeUndefined();

    const result = validateProject({ root: project.root, today: '2026-11-08' });
    expect(result.errors.some((issue) => issue.message.includes('根拠IDが重複: ref-a'))).toBe(true);
  });
});

// ---------------- C11 到達できないランク ----------------

function projectFor(scenario: Scenario): Project {
  const roleFile = `scenarios/${scenario.id}/roles/executive.yaml`;
  return {
    root: '',
    today: '2026-11-08',
    scenarios: [
      {
        id: scenario.id,
        dir: scenario.id,
        file: `scenarios/${scenario.id}/scenario.yaml`,
        sceneSource: {
          file: `scenarios/${scenario.id}/scenario.yaml`,
          data: scenario,
          errors: [],
        },
        roleSources: new Map([
          ['executive', { file: roleFile, data: scenario.roles.executive, errors: [] }],
        ]),
        scenario: scenario as unknown as Record<string, any>,
      },
    ],
    references: { file: 'references/references.yaml', data: fixtureRefs, errors: [] },
    referencesById: new Map(fixtureRefs.map((ref) => [ref.id, ref as unknown as Record<string, any>])),
    locales: {},
    audioManifest: null,
    audioFiles: [],
    denylist: { companies: [], services: [], people: [], countries: [], comparisons: [] },
    loadIssues: [],
  } as unknown as Project;
}

/** 判断1つだけのシナリオ。choices の点数で到達するランクを決める */
function onePoint(points: number[]): Scenario {
  const scenario = structuredClone(fixture);
  const role = scenario.roles.executive!;
  role.pressEnabled = false;
  role.events = [];
  role.deadlines = [];
  delete role.drafts;
  role.points = [
    {
      id: 'p-solo',
      phase: 'detect',
      text: { ja: '判断', en: 'Choice' },
      choices: points.map((value, index) => ({
        id: `c-${index}`,
        text: { ja: `選択${index}`, en: `Choice ${index}` },
        minutes: 15,
        category: value >= 0 ? 'maintain' : 'hurt',
        points: value,
        refs: ['ref-a'],
      })),
    },
  ];
  return scenario;
}

describe('C11 到達できないランク', () => {
  it('A・B・C の欠けは警告（エラーにしない）', () => {
    const issues = checkC11(projectFor(onePoint([1000, -50])));
    expect(issues.every((issue) => issue.code === 'C11')).toBe(true);
    const warnings = issues.filter((issue) => issue.severity === 'warning');
    expect(warnings.map((issue) => issue.message).sort()).toEqual([
      '到達できないランクがある: A',
      '到達できないランクがある: B',
      '到達できないランクがある: C',
    ]);
    expect(issues.some((issue) => issue.severity === 'error')).toBe(false);
  });

  it('S・D の欠けはエラー', () => {
    const onlyS = checkC11(projectFor(onePoint([1000])));
    const onlyD = checkC11(projectFor(onePoint([-50])));
    expect(onlyS.filter((issue) => issue.severity === 'error').map((issue) => issue.message))
      .toEqual(['到達できないランクがある: D']);
    expect(onlyD.filter((issue) => issue.severity === 'error').map((issue) => issue.message))
      .toEqual(['到達できないランクがある: S']);
  });

  it('5ランクすべてに届けばエラーも警告もない', () => {
    const issues = checkC11(projectFor(onePoint([1000, 600, 300, 100, -50])));
    expect(issues).toEqual([]);
  });
});
