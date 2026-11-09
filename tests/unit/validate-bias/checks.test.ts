// C23（正解が長さで分かる）・C24（最高点の位置の偏り）・C25（振り返りの解説）の検査。
import { describe, it, expect, afterEach } from 'vitest';
import { checkC23, checkC24, checkC25 } from '../../../tools/validate/checks.ts';
import type { LoadedScenario, Obj, Project } from '../../../tools/validate/project.ts';
import { L, validateFixture } from '../validate/helpers.ts';
import type { ValidatedProject } from '../validate/helpers.ts';

const SCENARIO_FILE = 'scenarios/fake/scenario.yaml';
const ROLE_FILE = 'scenarios/fake/roles/executive.yaml';

/** C23〜C25 だけを動かすための最小のプロジェクト。 */
function fakeProject(script: Obj): Project {
  const source = (file: string, data: unknown) => ({ file, data, errors: [], warnings: [] });
  const scenario: LoadedScenario = {
    id: 'fake',
    dir: 'fake',
    file: SCENARIO_FILE,
    sceneSource: source(SCENARIO_FILE, {}),
    roleSources: new Map([['executive', source(ROLE_FILE, script)]]),
    scenario: { id: 'fake', roles: { executive: script } },
  };
  return {
    root: '/fake',
    today: '2026-11-08',
    scenarios: [scenario],
    references: null,
    referencesById: new Map(),
    locales: {},
    audioManifest: null,
    audioFiles: [],
    denylist: { companies: [], services: [], people: [], countries: [], comparisons: [] },
    loadIssues: [],
  };
}

function choice(id: string, points: number, ja: string): Obj {
  return { id, text: { ja, en: '' }, minutes: 30, category: 'maintain', points, refs: [] };
}

function point(id: string, choices: Obj[]): Obj {
  return { id, phase: 'detect', text: L(`判断${id}`), choices };
}

/** 最高点が指定の位置（0始まり）に来る判断ポイント。 */
function pointWithTop(id: string, topIndex: number): Obj {
  const choices = [0, 1, 2].map((index) => choice(`${id}-c${index}`, index === topIndex ? 100 : -10, `選択肢${index}`));
  return point(id, choices);
}

function slot(id: string, options: Obj[]): Obj {
  return { id, label: L(`部品${id}`), options };
}

function draft(slots: Obj[]): Obj {
  return { title: L('文案'), slots };
}

/** 解説を全部そろえた役（C25 を出さない）。 */
function completeScript(points: Obj[]): Obj {
  for (const p of points) {
    p.lesson = L('模範の考え方');
    for (const c of p.choices as Obj[]) c.explain = L('なぜこの点数か');
  }
  return { points };
}

const cleanups: (() => void)[] = [];

function run(mutate?: Parameters<typeof validateFixture>[0]): ValidatedProject {
  const project = validateFixture(mutate);
  cleanups.push(project.cleanup);
  return project;
}

function warningCodes(project: ValidatedProject): string[] {
  return project.result.warnings.map((issue) => issue.code);
}

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

describe('C23 正解が長さで分かる', () => {
  it('最高点の選択肢が他の 1.3 倍以上なら警告', () => {
    const script = completeScript([
      point('p1', [choice('good', 100, 'あ'.repeat(20)), choice('bad', -10, 'い'.repeat(10))]),
    ]);
    const issues = checkC23(fakeProject(script));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('C23');
    expect(issues[0]?.severity).toBe('warning');
    expect(issues[0]?.file).toBe(ROLE_FILE);
  });

  it('ちょうど 1.3 倍は警告する（13 文字と 10 文字）', () => {
    const script = completeScript([
      point('p1', [choice('good', 100, 'あ'.repeat(13)), choice('bad', -10, 'い'.repeat(10))]),
    ]);
    expect(checkC23(fakeProject(script)).map((issue) => issue.code)).toEqual(['C23']);
  });

  it('1.3 倍未満は警告しない（12 文字と 10 文字）', () => {
    const script = completeScript([
      point('p1', [choice('good', 100, 'あ'.repeat(12)), choice('bad', -10, 'い'.repeat(10))]),
    ]);
    expect(checkC23(fakeProject(script))).toEqual([]);
  });

  it('比較するのは他の選択肢のうち最も長いもの', () => {
    const script = completeScript([
      point('p1', [
        choice('good', 100, 'あ'.repeat(19)),
        choice('bad', -10, 'い'.repeat(10)),
        choice('bad2', -20, 'う'.repeat(15)),
      ]),
    ]);
    // 19 / 15 = 1.27 倍なので警告しない
    expect(checkC23(fakeProject(script))).toEqual([]);
  });

  it('最高点が同点のときは判定しない', () => {
    const script = completeScript([
      point('p1', [choice('a', 100, 'あ'.repeat(30)), choice('b', 100, 'い'.repeat(5))]),
    ]);
    expect(checkC23(fakeProject(script))).toEqual([]);
  });

  it('報告書スロットの options も見る', () => {
    const script = completeScript([
      point('p1', [choice('a', 100, 'あ'.repeat(5)), choice('b', -10, 'い'.repeat(5))]),
    ]);
    script.drafts = {
      report: draft([slot('s1', [choice('long', 10, 'う'.repeat(20)), choice('short', -5, 'え'.repeat(5))])]),
    };
    const issues = checkC23(fakeProject(script));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain('報告書スロット');
  });
});

describe('C24 最高点の位置の偏り', () => {
  it('同じ位置に集中していれば警告', () => {
    const script = completeScript([
      pointWithTop('p1', 0),
      pointWithTop('p2', 0),
      pointWithTop('p3', 0),
      pointWithTop('p4', 0),
    ]);
    const issues = checkC24(fakeProject(script));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('C24');
    expect(issues[0]?.severity).toBe('warning');
    expect(issues[0]?.message).toContain('1 番');
    expect(issues[0]?.message).toContain('4/4 件');
  });

  it('ちょうど 50% は警告する', () => {
    const script = completeScript([
      pointWithTop('p1', 0),
      pointWithTop('p2', 0),
      pointWithTop('p3', 1),
      pointWithTop('p4', 2),
    ]);
    expect(checkC24(fakeProject(script)).map((issue) => issue.code)).toEqual(['C24']);
  });

  it('50% 未満は警告しない', () => {
    const script = completeScript([
      pointWithTop('p1', 0),
      pointWithTop('p2', 0),
      pointWithTop('p3', 1),
      pointWithTop('p4', 1),
      pointWithTop('p5', 2),
    ]);
    // 2/5 = 40%
    expect(checkC24(fakeProject(script))).toEqual([]);
  });

  it('報告書スロットも最高点の位置を数える', () => {
    const script = completeScript([
      point('p1', [choice('a', 100, 'あ'), choice('b', -10, 'い')]),
    ]);
    const top = (id: string) => [choice(`${id}-top`, 10, 'あ'), choice(`${id}-low`, -5, 'い')];
    const low = (id: string) => [choice(`${id}-low`, -5, 'あ'), choice(`${id}-top`, 10, 'い')];
    script.drafts = {
      report: draft([slot('s1', top('s1')), slot('s2', top('s2')), slot('s3', low('s3'))]),
    };
    const issues = checkC24(fakeProject(script));
    const slotIssue = issues.find((issue) => issue.message.includes('報告書スロット'));
    expect(slotIssue?.message).toContain('2/3 件');
  });

  it('最高点が同点の判断は数えない', () => {
    const script = completeScript([
      point('p1', [choice('a', 100, 'あ'), choice('b', 100, 'い')]),
      point('p2', [choice('c', 100, 'う'), choice('d', 100, 'え')]),
    ]);
    expect(checkC24(fakeProject(script))).toEqual([]);
  });
});

describe('C25 振り返りの解説', () => {
  it('lesson と explain の欠けをロールごとに 1 行へまとめる', () => {
    const script = {
      points: [
        point('p1', [choice('a', 100, 'あ'), choice('b', -10, 'い')]),
        point('p2', [choice('c', 100, 'う'), choice('d', -10, 'え')]),
      ],
    };
    const issues = checkC25(fakeProject(script));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('C25');
    expect(issues[0]?.severity).toBe('warning');
    // lesson 2 件 + explain 4 件
    expect(issues[0]?.message).toContain('6 件');
  });

  it('報告書スロットの options[].explain も数える', () => {
    const script = {
      points: [point('p1', [choice('a', 100, 'あ'), choice('b', -10, 'い')])],
      drafts: {
        report: draft([slot('s1', [choice('o1', 10, 'う'), choice('o2', -5, 'え')])]),
      },
    };
    // lesson 1 + explain 2 + スロットの explain 2
    const issues = checkC25(fakeProject(script));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain('5 件');
  });

  it('en が空でも ja があれば欠けとみなさない', () => {
    const script = completeScript([
      point('p1', [choice('a', 100, 'あ'), choice('b', -10, 'い')]),
    ]);
    for (const p of script.points) {
      p.lesson = { ja: '考え方', en: '' };
      for (const c of p.choices as Obj[]) c.explain = { ja: '理由', en: '' };
    }
    expect(checkC25(fakeProject(script))).toEqual([]);
  });

  it('ja が空、または Localized でないものは欠けとみなす', () => {
    const script = completeScript([
      point('p1', [choice('a', 100, 'あ'), choice('b', -10, 'い')]),
    ]);
    const target = script.points[0] as Obj;
    const choices = target.choices as Obj[];
    target.lesson = { ja: '', en: '' };
    choices[0]!.explain = 'ただの文字列';
    choices[1]!.explain = { en: 'english only' };
    const issues = checkC25(fakeProject(script));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain('3 件');
  });
});

describe('validate への組み込み', () => {
  it('用意したプロジェクトでは C23〜C25 が警告として出る（エラーではない）', () => {
    const project = run();
    const codes = warningCodes(project);
    expect(project.result.errors).toEqual([]);
    expect(codes).toContain('C23');
    expect(codes).toContain('C24');
    expect(codes).toContain('C25');
  });

  it('C25 はロールごとに 1 行', () => {
    const project = run();
    const issues = project.result.warnings.filter((issue) => issue.code === 'C25');
    expect(issues).toHaveLength(1);
    expect(issues[0]?.file).toBe('scenarios/no04-goride/roles/executive.yaml');
  });

  it('C23 は選択肢の行を指す', () => {
    const project = run((files) => {
      files.roles.executive.points[0].choices[0].text = { ja: 'あ'.repeat(50), en: '' };
    });
    const issue = project.result.warnings.find((warning) => warning.code === 'C23');
    expect(issue?.file).toBe('scenarios/no04-goride/roles/executive.yaml');
    expect(issue?.line).toBeGreaterThan(1);
  });

  it('解説をすべて書けば C25 は出ない', () => {
    const project = run((files) => {
      for (const p of files.roles.executive.points) {
        p.lesson = L('模範の考え方');
        for (const c of p.choices) c.explain = L('なぜこの点数か');
      }
      for (const d of Object.values(files.roles.executive.drafts)) {
        for (const s of (d as Obj).slots) {
          if (!Array.isArray(s.options)) continue;
          for (const o of s.options) o.explain = L('なぜこの点数か');
        }
      }
    });
    expect(warningCodes(project)).not.toContain('C25');
  });
});
