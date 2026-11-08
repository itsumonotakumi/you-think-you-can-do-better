// テスト用の小さなプロジェクトを一時ディレクトリに作る。
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { stringify } from 'yaml';
import { MISLEADING_TYPES } from '../../../src/engine/types.ts';
import { validateProject } from '../../../tools/validate/checks.ts';
import type { ValidationResult } from '../../../tools/validate/checks.ts';

export type Obj = Record<string, any>;

export const L = (ja: string): { ja: string; en: string } => ({ ja, en: `EN:${ja}` });

const PHASES = ['detect', 'contain', 'organize', 'investigate', 'notify', 'recover', 'after'];
const TYPES = [...MISLEADING_TYPES].slice(0, 8);

export interface TestFiles {
  scenario: Obj;
  roles: Record<string, Obj> & { executive: Obj };
  references: Obj[];
  notices: Record<string, Record<string, string>> & { ja: Record<string, string>; en: Record<string, string> };
  /** lang -> ファイル名 -> 平坦なキー */
  ui: Record<string, Record<string, Record<string, string>>>;
  audioManifest: Obj[] | null;
  audioFiles: string[];
  denylist: Obj | null;
}

function makeRole(): Obj {
  const voices: Obj[] = TYPES.map((type, i) => ({
    id: `v-mis-${i}`,
    media: 'sns',
    misleading: true,
    type,
    text: L(`誤った声${i}`),
    trigger: { at: 'point' },
  }));
  voices.push(
    { id: 'v-ok', media: 'chat', misleading: false, text: L('正しい声'), trigger: { at: 'point' } },
    { id: 'v-after', media: 'sns', misleading: false, text: L('批判'), trigger: { at: 'after', choice: 'p-0-good' } },
    { id: 'v-c2', media: 'sns', misleading: false, text: L('臆病2'), trigger: { at: 'manual' } },
    { id: 'v-c3', media: 'sns', misleading: false, text: L('臆病3'), trigger: { at: 'manual' } },
    { id: 'v-c4', media: 'news', misleading: false, text: L('臆病4'), trigger: { at: 'manual' } },
  );

  const points: Obj[] = [];
  for (let i = 0; i < 15; i += 1) {
    points.push({
      id: `p-${i}`,
      phase: PHASES[i % PHASES.length],
      text: L(`判断${i}`),
      voices: [`v-mis-${i % TYPES.length}`, 'v-ok'],
      choices: [
        {
          id: `p-${i}-good`,
          text: L('正しい対応'),
          minutes: 30,
          category: 'increase',
          points: 300,
          refs: ['ref-a'],
          items: [0, 1, 2].map((j) => ({
            id: `i-${i}-g-${j}`,
            points: 5,
            axis: 'time',
            refs: ['ref-a'],
          })),
        },
        {
          id: `p-${i}-bad`,
          text: L('保留'),
          minutes: 60,
          category: 'hurt',
          points: -50,
          refs: ['ref-a'],
          coward: true,
          items: [0, 1].map((j) => ({
            id: `i-${i}-b-${j}`,
            points: -5,
            axis: 'care',
            refs: ['ref-a'],
          })),
        },
      ],
    });
  }

  const draftItems = Array.from({ length: 10 }, (_, i) => ({
    id: `d-item-${i}`,
    when: { withinHours: 24 * (i + 1) },
    points: 5,
    axis: 'time',
    refs: ['ref-a'],
  }));
  const draftOptions = Array.from({ length: 3 }, (_, i) => ({
    id: `d-opt-${i}`,
    text: L(`部品${i}`),
    points: 5,
    axis: 'content',
    refs: ['ref-a'],
  }));

  return {
    estimateMinutes: 20,
    intro: L('導入'),
    pressEnabled: false,
    cowardVoices: { '2': 'v-c2', '3': 'v-c3', '4': 'v-c4' },
    deadlines: [{ id: 'dl-prelim', ref: 'ref-prelim', label: L('速報'), points: -50, doneFlag: 'reported' }],
    voices,
    points,
    drafts: {
      draft1: {
        title: L('第1報の文案'),
        slots: [
          { id: 'timing', label: L('時刻'), auto: true, items: draftItems },
          { id: 'scope', label: L('範囲'), options: draftOptions },
        ],
      },
    },
  };
}

function makeFiles(): TestFiles {
  const notices = {
    criminal: '悪いのは攻撃者です',
    fiction: 'フィクションです',
    score: '高得点でも現実の対応が正しいとは限りません',
    purpose: '学ぶためのツールです',
    voices: 'ゲーム内の反応です',
    replay: '2回目は現実にない',
  };
  return {
    scenario: {
      id: 'no04-goride',
      version: '1.0.0',
      status: 'latest',
      published: '2026-12-01',
      sourcePeriod: L('2026年秋'),
      difficulty: 4,
      languages: ['ja'],
      referencesVersion: '2026-11-08',
      legalPack: 'jp',
      title: L('ゴーライド事件'),
      tagline: L('止められるか'),
      company: {
        name: L('株式会社ゴーライド'),
        industry: L('カーシェア'),
        size: L('従業員1,200名'),
        people: [
          { id: 'ceo', name: L('架空の経営者'), title: L('代表取締役') },
        ],
      },
      start: { day: 0, minutes: 540 },
      initialGauges: { damage: 20, flame: 0, trust: 70, stamina: 100 },
      audio: { bgmDefault: 'tension_low', bgmByPhase: { notify: 'tension_mid' } },
      endings: {
        S: { text: L('S'), bgm: 'ending_s' },
        A: { text: L('A'), bgm: 'ending_a' },
        B: { text: L('B'), bgm: 'ending_b' },
        C: { text: L('C'), bgm: 'ending_c' },
        D: { text: L('D'), bgm: 'ending_d' },
      },
      salesModel: { base: 100, trustWeight: 0.4, fatalPenalty: 10, min: 40, max: 130 },
    },
    roles: { executive: makeRole() },
    references: [
      {
        id: 'ref-a',
        title: L('根拠A'),
        issuer: L('発行者'),
        version: '2026-11',
        section: L('節'),
        summary: L('要約'),
        checkedAt: '2026-11-08',
        legalPack: 'jp',
      },
      {
        id: 'ref-prelim',
        title: L('速報'),
        issuer: L('個人情報保護委員会'),
        version: '2026-11',
        section: L('3〜5日'),
        summary: L('早く出す'),
        checkedAt: '2026-11-08',
        legalPack: 'jp',
        deadlineHours: 72,
      },
    ],
    notices: { ja: notices, en: { ...notices } },
    ui: {
      ja: { common: { 'title.start': 'はじめる' } },
      en: { common: { 'title.start': 'Start' } },
    },
    audioManifest: null,
    audioFiles: [],
    denylist: null,
  };
}

function writeYaml(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, stringify(value, { lineWidth: 0 }));
}

export interface TestProject {
  root: string;
  files: TestFiles;
  cleanup: () => void;
}

export function createProject(mutate?: (files: TestFiles) => void): TestProject {
  const files = makeFiles();
  mutate?.(files);
  const root = mkdtempSync(join(tmpdir(), 'ytcdb-validate-'));
  const scenarioDir = join(root, 'scenarios', files.scenario.id);
  writeYaml(join(scenarioDir, 'scenario.yaml'), files.scenario);
  for (const [role, script] of Object.entries(files.roles)) {
    writeYaml(join(scenarioDir, 'roles', `${role}.yaml`), script);
  }
  writeYaml(join(root, 'references', 'references.yaml'), files.references);
  for (const [lang, notices] of Object.entries(files.notices)) {
    writeYaml(join(root, 'locales', lang, 'notices.yaml'), notices);
  }
  for (const [lang, uiFiles] of Object.entries(files.ui)) {
    for (const [name, strings] of Object.entries(uiFiles)) {
      writeYaml(join(root, 'locales', lang, 'ui', `${name}.yaml`), strings);
    }
  }
  if (files.audioManifest !== null) {
    writeYaml(join(root, 'audio', 'audio-manifest.yaml'), files.audioManifest);
  }
  for (const file of files.audioFiles) {
    const full = join(root, 'audio', file);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, 'dummy');
  }
  if (files.denylist !== null) {
    writeYaml(join(root, 'tools', 'validate', 'denylist.yaml'), files.denylist);
  }
  return {
    root,
    files,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

export interface ValidatedProject extends TestProject {
  result: ValidationResult;
}

export function validateFixture(mutate?: (files: TestFiles) => void): ValidatedProject {
  const project = createProject(mutate);
  const result = validateProject({ root: project.root, today: '2026-11-08' });
  return { ...project, result };
}

export function errorCodes(result: ValidationResult): string[] {
  return result.errors.map((issue) => issue.code);
}
