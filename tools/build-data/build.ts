// YAML → src/data/*.json。検査（C01〜C22）を通ったものだけを書き出す。
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { loadProject } from '../validate/project.ts';
import { runChecks } from '../validate/checks.ts';
import { LANGS, ROLES } from '../../src/engine/types.ts';
import type { AudioAsset, Reference, Scenario, ScenarioSummary } from '../../src/engine/types.ts';

/** シナリオ id の書式（No.付きと無しの両方を許す）。 */
export const SCENARIO_ID_RE = /^no[0-9]{2}-[a-z0-9-]+$|^[a-z0-9-]+$/;

/** シナリオ id を検証する。フォルダ名と一致し、安全な文字だけであること。 */
export function assertSafeScenarioId(id: unknown, dir: string): asserts id is string {
  if (typeof id !== 'string' || !SCENARIO_ID_RE.test(id)) {
    throw new Error(`シナリオIDが不正: ${String(id)}（英小文字・数字・ハイフンだけ）`);
  }
  if (id !== dir) {
    throw new Error(`シナリオIDがフォルダ名と一致しない: ${id} != ${dir}`);
  }
}

/** target が baseDir の中（または同じ）にあるか。 */
export function isPathInside(baseDir: string, target: string): boolean {
  const base = resolve(baseDir);
  const full = resolve(target);
  return full === base || full.startsWith(`${base}${sep}`);
}

function insideFile(baseDir: string, ...parts: string[]): string {
  const target = resolve(baseDir, ...parts);
  if (!isPathInside(baseDir, target)) {
    throw new Error(`出力先がデータフォルダの外になる: ${target}`);
  }
  return target;
}

export interface BuildOptions {
  root: string;
  /** 出力先。省略時は <root>/src/data */
  outDir?: string;
}

export interface BuildResult {
  written: string[];
  scenarios: string[];
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function buildData(options: BuildOptions): BuildResult {
  const root = options.root;
  const outDir = resolve(options.outDir ?? join(root, 'src', 'data'));
  const project = loadProject({ root });

  // 出力ファイル名に使う前に id を検証する（フォルダ名と一致・書式・パス脱出なし）。
  for (const sc of project.scenarios) {
    assertSafeScenarioId(sc.scenario.id, sc.dir);
  }

  // 単体実行でも validate と同じ検査を全部通す。1つでもエラーなら書き出さない。
  if (project.scenarios.length > 0) {
    const result = runChecks(project);
    if (result.errors.length > 0) {
      const first = result.errors[0]!;
      const rest = result.errors.length - 1;
      throw new Error(
        `${first.file}:${first.line}: [${first.code}] ${first.message}`
        + (rest > 0 ? `（ほか ${rest} 件のエラー）` : ''),
      );
    }
  }

  const scenarios: Scenario[] = project.scenarios.map((sc) => sc.scenario as Scenario);
  const summaries: ScenarioSummary[] = [];
  for (const scenario of scenarios) {
    if (scenario.status === 'retired') continue;
    const roles = ROLES
      .filter((role) => scenario.roles[role] !== undefined)
      .map((role) => ({ role, estimateMinutes: scenario.roles[role]?.estimateMinutes ?? 0 }));
    summaries.push({
      id: scenario.id,
      version: scenario.version,
      status: scenario.status,
      title: scenario.title,
      tagline: scenario.tagline,
      sourcePeriod: scenario.sourcePeriod,
      difficulty: scenario.difficulty,
      roles,
    });
  }
  summaries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const scenariosDir = insideFile(outDir, 'scenarios');
  rmSync(scenariosDir, { recursive: true, force: true });
  mkdirSync(scenariosDir, { recursive: true });

  const written: string[] = [];

  writeJson(insideFile(outDir, 'index.json'), summaries);
  written.push('index.json');

  const scenarioIds: string[] = [];
  for (const scenario of scenarios) {
    writeJson(insideFile(scenariosDir, `${scenario.id}.json`), scenario);
    scenarioIds.push(scenario.id);
    written.push(`scenarios/${scenario.id}.json`);
  }

  const references = (project.references && Array.isArray(project.references.data)
    ? project.references.data
    : []) as Reference[];
  writeJson(insideFile(outDir, 'references.json'), references);
  written.push('references.json');

  const locales: Record<string, { strings: Record<string, string>; notices: Record<string, string> }> = {};
  for (const lang of LANGS) {
    const data = project.locales[lang] ?? { strings: {}, notices: {} };
    locales[lang] = { strings: data.strings, notices: data.notices };
  }
  writeJson(insideFile(outDir, 'locales.json'), locales);
  written.push('locales.json');

  const audio = (project.audioManifest && Array.isArray(project.audioManifest.data)
    ? project.audioManifest.data
    : []) as AudioAsset[];
  writeJson(insideFile(outDir, 'audio.json'), audio);
  written.push('audio.json');

  return { written, scenarios: scenarioIds };
}
