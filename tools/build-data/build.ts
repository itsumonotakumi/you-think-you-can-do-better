// YAML → src/data/*.json。検査は tools/validate が担当する。
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject } from '../validate/project.ts';
import { LANGS, ROLES } from '../../src/engine/types.ts';
import type { AudioAsset, Reference, Scenario, ScenarioSummary } from '../../src/engine/types.ts';

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
  const outDir = options.outDir ?? join(root, 'src', 'data');
  const project = loadProject({ root });

  const fatal = project.scenarios.length === 0
    ? undefined
    : project.loadIssues.find((issue) => issue.severity === 'error');
  if (fatal) {
    throw new Error(`${fatal.file}:${fatal.line}: [${fatal.code}] ${fatal.message}`);
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

  const scenariosDir = join(outDir, 'scenarios');
  rmSync(scenariosDir, { recursive: true, force: true });
  mkdirSync(scenariosDir, { recursive: true });

  const written: string[] = [];

  writeJson(join(outDir, 'index.json'), summaries);
  written.push('index.json');

  const scenarioIds: string[] = [];
  for (const scenario of scenarios) {
    writeJson(join(scenariosDir, `${scenario.id}.json`), scenario);
    scenarioIds.push(scenario.id);
    written.push(`scenarios/${scenario.id}.json`);
  }

  const references = (project.references && Array.isArray(project.references.data)
    ? project.references.data
    : []) as Reference[];
  writeJson(join(outDir, 'references.json'), references);
  written.push('references.json');

  const locales: Record<string, { strings: Record<string, string>; notices: Record<string, string> }> = {};
  for (const lang of LANGS) {
    const data = project.locales[lang] ?? { strings: {}, notices: {} };
    locales[lang] = { strings: data.strings, notices: data.notices };
  }
  writeJson(join(outDir, 'locales.json'), locales);
  written.push('locales.json');

  const audio = (project.audioManifest && Array.isArray(project.audioManifest.data)
    ? project.audioManifest.data
    : []) as AudioAsset[];
  writeJson(join(outDir, 'audio.json'), audio);
  written.push('audio.json');

  return { written, scenarios: scenarioIds };
}
