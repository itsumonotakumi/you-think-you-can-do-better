// 入力（シナリオ・根拠・文言・音素材）をまとめて読む。validate と build-data の共通入口。
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readYaml, readYamlFile, locate } from './source.ts';
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

function warning(file: string, line: number, code: string, message: string): Issue {
  return { file, line, code, message, severity: 'warning' };
}

/** YAML の構文エラーと警告を C17 として積む。 */
function pushYamlIssues(source: ParsedSource, issues: Issue[], code = 'C17'): void {
  for (const e of source.errors) {
    issues.push(issue(source.file, e.line, code, `YAML の書式エラー: ${e.message}`));
  }
  for (const w of source.warnings) {
    issues.push(issue(source.file, w.line, 'C17', `YAML の警告: ${w.message}`));
  }
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

const DENYLIST_KEYS = ['companies', 'services', 'people', 'countries', 'comparisons'] as const;

function loadDenylist(root: string, issues: Issue[]): Denylist {
  const relative = 'tools/validate/denylist.yaml';
  const empty: Denylist = { companies: [], services: [], people: [], countries: [], comparisons: [] };
  let source = readYaml(root, relative);
  let fallback = false;
  if (!source) {
    // 禁止リストが無いまま素通りさせない（fail-closed）。
    // まず道具に同梱した既定リストで検査し、それも読めないときだけエラーにする。
    const bundled = fileURLToPath(new URL('./denylist.yaml', import.meta.url));
    source = readYamlFile(bundled, relative);
    fallback = true;
  }
  if (!source) {
    issues.push(issue(relative, 1, 'C16', '禁止リスト（denylist.yaml）がない'));
    return empty;
  }
  pushYamlIssues(source, issues, 'C16');
  const data = asObject(source.data);
  if (!data) {
    issues.push(issue(source.file, 1, 'C16', 'denylist.yaml はキーと配列のオブジェクトで書く'));
    return empty;
  }
  if (fallback) {
    issues.push(warning(relative, 1, 'C16',
      'denylist.yaml がないため同梱の既定リストで検査する'));
  }
  const result: Denylist = { companies: [], services: [], people: [], countries: [], comparisons: [] };
  for (const key of DENYLIST_KEYS) {
    const value = data[key];
    if (!Array.isArray(value)) {
      issues.push(issue(source.file, locate(data, key)?.line ?? 1, 'C16',
        `denylist の ${key} は配列で書く`));
      continue;
    }
    for (const entry of value) {
      if (typeof entry !== 'string' || entry.length === 0) {
        issues.push(issue(source.file, locate(data, key)?.line ?? 1, 'C16',
          `denylist の ${key} は空でない文字列だけにする`));
        continue;
      }
      if (key === 'comparisons') {
        try {
          new RegExp(entry);
        } catch {
          issues.push(issue(source.file, locate(data, key)?.line ?? 1, 'C20',
            `denylist の comparisons に不正な正規表現がある: ${entry}`));
          continue;
        }
      }
      result[key].push(entry);
    }
  }
  return result;
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
      pushYamlIssues(noticesSource, issues);
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
      pushYamlIssues(source, issues);
      const strings = asObject(source.data);
      if (!strings) continue;
      // ネストしたキーは "a.b.c" に平坦化する。循環参照でも止まるよう訪問済みを持つ。
      const flat: [string, unknown, number][] = [];
      const visited = new WeakSet<object>();
      const walk = (obj: Record<string, unknown>, prefix: string, parentLine: number): void => {
        if (visited.has(obj)) return;
        visited.add(obj);
        for (const [k, v] of Object.entries(obj)) {
          const line = locate(obj, k)?.line ?? parentLine;
          const sub = typeof v === 'object' && v !== null && !Array.isArray(v) ? asObject(v) : null;
          if (sub) walk(sub, `${prefix}${k}.`, line);
          else flat.push([`${prefix}${k}`, v, line]);
        }
      };
      walk(strings, '', 1);
      for (const [key, value, line] of flat) {
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
  pushYamlIssues(source, issues);
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
    for (const w of sceneSource.warnings) {
      issues.push(issue(sceneSource.file, w.line, 'C17', `YAML の警告: ${w.message}`));
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
      pushYamlIssues(source, issues);
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
      if (!obj || typeof obj.id !== 'string') continue;
      // 同じIDは期限の初期化が最初の定義を使うため、検査側も最初を採用して重複をエラーにする
      if (referencesById.has(obj.id)) {
        loadIssues.push(issue(references.file, locate(obj, 'id')?.line ?? 1, 'C01',
          `根拠IDが重複: ${obj.id}`));
        continue;
      }
      referencesById.set(obj.id, obj);
    }
  }
  const locales = loadLocales(root, loadIssues);
  const audioManifest = readYaml(root, 'audio/audio-manifest.yaml');
  if (audioManifest) pushYamlIssues(audioManifest, loadIssues);
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
