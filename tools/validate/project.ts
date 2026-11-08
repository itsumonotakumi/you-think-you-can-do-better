// 入力（シナリオ・根拠・文言・音素材）をまとめて読む。validate と build-data の共通入口。
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { readYaml, locate } from './source.ts';
import type { ParsedSource } from './source.ts';
import { LANGS, ROLES } from '../../src/engine/types.ts';

export type Obj = Record<string, any>;

export interface Issue {
  file: string;
  line: number;
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface LoadedScenario {
  id: string;
  dir: string;
  file: string;
  sceneSource: ParsedSource;
  roleSources: Map<string, ParsedSource>;
  scenario: Obj;
}

export interface LocaleData {
  strings: Record<string, string>;
  notices: Record<string, string>;
}

export interface Denylist {
  companies: string[];
  services: string[];
  people: string[];
  countries: string[];
  comparisons: string[];
}

export interface Project {
  root: string;
  today: string;
  scenarios: LoadedScenario[];
  references: ParsedSource | null;
  referencesById: Map<string, Obj>;
  locales: Record<string, LocaleData>;
  audioManifest: ParsedSource | null;
  audioFiles: string[];
  denylist: Denylist;
  loadIssues: Issue[];
}

const NOTICE_IDS = ['criminal', 'fiction', 'score', 'purpose', 'voices', 'replay'];
const AUDIO_EXTS = new Set(['mp3', 'ogg', 'oga', 'wav', 'm4a', 'aac', 'webm', 'flac']);

function issue(file: string, line: number, code: string, message: string): Issue {
  return { file, line, code, message, severity: 'error' };
}

function asObject(value: unknown): Obj | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Obj;
}

function listDirs(absDir: string): string[] {
  try {
    return readdirSync(absDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

function listYamlFiles(absDir: string): string[] {
  try {
    return readdirSync(absDir, { withFileTypes: true })
      .filter((e) => e.isFile() && /\.ya?ml$/.test(e.name))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

function collectAudioFiles(absDir: string, prefix: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      collectAudioFiles(join(absDir, entry.name), rel, out);
      continue;
    }
    if (entry.name === 'audio-manifest.yaml') continue;
    const ext = entry.name.includes('.') ? entry.name.split('.').pop()?.toLowerCase() : '';
    if (ext && AUDIO_EXTS.has(ext)) out.push(rel);
  }
}

function loadDenylist(root: string, issues: Issue[]): Denylist {
  const relative = 'tools/validate/denylist.yaml';
  const source = readYaml(root, relative);
  const empty: Denylist = { companies: [], services: [], people: [], countries: [], comparisons: [] };
  if (!source) return empty;
  for (const e of source.errors) issues.push(issue(source.file, e.line, 'C17', `YAML の書式エラー: ${e.message}`));
  const data = asObject(source.data);
  if (!data) return empty;
  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
  return {
    companies: strings(data.companies),
    services: strings(data.services),
    people: strings(data.people),
    countries: strings(data.countries),
    comparisons: strings(data.comparisons),
  };
}

function loadLocales(root: string, issues: Issue[]): Record<string, LocaleData> {
  const result: Record<string, LocaleData> = {};
  for (const lang of LANGS) result[lang] = { strings: {}, notices: {} };
  const absLocales = join(root, 'locales');
  for (const lang of listDirs(absLocales)) {
    if (!LANGS.includes(lang as (typeof LANGS)[number])) continue;
    const data = result[lang] as LocaleData;

    const noticesRel = `locales/${lang}/notices.yaml`;
    const noticesSource = readYaml(root, noticesRel);
    if (noticesSource) {
      for (const e of noticesSource.errors) {
        issues.push(issue(noticesSource.file, e.line, 'C17', `YAML の書式エラー: ${e.message}`));
      }
      const notices = asObject(noticesSource.data);
      if (notices) {
        for (const [rawKey, value] of Object.entries(notices)) {
          const key = rawKey.replace(/^notice\./, '');
          if (!NOTICE_IDS.includes(key)) {
            issues.push(issue(noticesSource.file, locate(notices, rawKey)?.line ?? 1, 'C17',
              `未知の注記ID: ${rawKey}（${NOTICE_IDS.join(', ')} のどれか）`));
            continue;
          }
          if (typeof value !== 'string' || value.length === 0) {
            issues.push(issue(noticesSource.file, locate(notices, rawKey)?.line ?? 1, 'C17',
              `注記 ${rawKey} の文言が空、または文字列でない`));
            continue;
          }
          data.notices[key] = value;
        }
      }
    }

    const uiDir = join(root, 'locales', lang, 'ui');
    const seen = new Map<string, string>();
    for (const name of listYamlFiles(uiDir)) {
      const rel = `locales/${lang}/ui/${name}`;
      const source = readYaml(root, rel);
      if (!source) continue;
      for (const e of source.errors) issues.push(issue(source.file, e.line, 'C17', `YAML の書式エラー: ${e.message}`));
      const strings = asObject(source.data);
      if (!strings) continue;
      for (const [key, value] of Object.entries(strings)) {
        const line = locate(strings, key)?.line ?? 1;
        if (typeof value !== 'string') {
          issues.push(issue(source.file, line, 'C17', `UI 文言 ${key} は文字列で書く`));
          continue;
        }
        const first = seen.get(key);
        if (first) {
          issues.push(issue(source.file, line, 'C17', `UI 文言のキーが重複: ${key}（${first} にもある）`));
          continue;
        }
        seen.set(key, source.file);
        data.strings[key] = value;
      }
    }
  }
  return result;
}

function loadReferences(root: string, issues: Issue[]): ParsedSource | null {
  const source = readYaml(root, 'references/references.yaml');
  if (!source) return null;
  for (const e of source.errors) issues.push(issue(source.file, e.line, 'C17', `YAML の書式エラー: ${e.message}`));
  return source;
}

function loadScenarios(root: string, issues: Issue[]): LoadedScenario[] {
  const absScenarios = join(root, 'scenarios');
  const result: LoadedScenario[] = [];
  for (const dir of listDirs(absScenarios)) {
    if (dir.startsWith('_')) continue;
    const yamlRel = `scenarios/${dir}/scenario.yaml`;
    const sceneSource = readYaml(root, yamlRel);
    if (!sceneSource) {
      issues.push(issue(yamlRel, 1, 'C17', 'scenario.yaml がない'));
      continue;
    }
    for (const e of sceneSource.errors) {
      issues.push(issue(sceneSource.file, e.line, 'C17', `YAML の書式エラー: ${e.message}`));
    }
    const sceneData = asObject(sceneSource.data) ?? {};
    const roles: Obj = {};
    const roleSources = new Map<string, ParsedSource>();
    const absRoles = join(root, 'scenarios', dir, 'roles');
    for (const name of listYamlFiles(absRoles)) {
      if (name.startsWith('_')) continue;
      const roleId = basename(name).replace(/\.ya?ml$/, '');
      const rel = `scenarios/${dir}/roles/${name}`;
      const source = readYaml(root, rel);
      if (!source) continue;
      for (const e of source.errors) {
        issues.push(issue(source.file, e.line, 'C17', `YAML の書式エラー: ${e.message}`));
      }
      if (!ROLES.includes(roleId as (typeof ROLES)[number])) {
        issues.push(issue(rel, 1, 'C01', `未知のロール: ${roleId}`));
        continue;
      }
      roleSources.set(roleId, source);
      const roleData = asObject(source.data);
      if (roleData) roles[roleId] = roleData;
    }
    if (Object.prototype.hasOwnProperty.call(sceneData, 'roles')) {
      issues.push(issue(yamlRel, locate(sceneData, 'roles')?.line ?? 1, 'C01',
        'ロールは scenarios/<id>/roles/<role>.yaml に分けて書く（scenario.yaml の roles は使わない）'));
    }
    result.push({
      id: dir,
      dir,
      file: yamlRel,
      sceneSource,
      roleSources,
      scenario: { ...sceneData, roles },
    });
  }
  return result;
}

export interface LoadProjectOptions {
  root: string;
  /** C22 の規約確認日判定に使う日付（YYYY-MM-DD）。省略時は今日。 */
  today?: string;
}

export function loadProject(options: LoadProjectOptions): Project {
  const root = options.root;
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const loadIssues: Issue[] = [];
  const scenarios = loadScenarios(root, loadIssues);
  const references = loadReferences(root, loadIssues);
  const referencesById = new Map<string, Obj>();
  if (references && Array.isArray(references.data)) {
    for (const ref of references.data) {
      const obj = asObject(ref);
      if (obj && typeof obj.id === 'string') referencesById.set(obj.id, obj);
    }
  }
  const locales = loadLocales(root, loadIssues);
  const audioManifest = readYaml(root, 'audio/audio-manifest.yaml');
  if (audioManifest) {
    for (const e of audioManifest.errors) {
      loadIssues.push(issue(audioManifest.file, e.line, 'C17', `YAML の書式エラー: ${e.message}`));
    }
  }
  const audioFiles: string[] = [];
  collectAudioFiles(join(root, 'audio'), '', audioFiles);
  audioFiles.sort();
  const denylist = loadDenylist(root, loadIssues);

  return {
    root,
    today,
    scenarios,
    references,
    referencesById,
    locales,
    audioManifest,
    audioFiles,
    denylist,
    loadIssues,
  };
}

/** 読み込んだデータが存在するか（テスト・build-data 用）。 */
export function hasFile(root: string, relativePath: string): boolean {
  return existsSync(join(root, relativePath));
}

/** ファイル内容をそのまま読む（build-data の補助）。 */
export function readText(root: string, relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}
