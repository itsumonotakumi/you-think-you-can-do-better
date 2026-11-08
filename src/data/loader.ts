// 生成 JSON の読み込み（オーケストレーター所有）。1シナリオずつ遅延読み込み。
import type { Scenario, ScenarioSummary, Reference, AudioAsset, Lang, NoticeId } from '../engine/types';

const scenarioModules = import.meta.glob<{ default: Scenario }>('./scenarios/*.json');

export async function loadIndex(): Promise<ScenarioSummary[]> {
  const m = import.meta.glob<{ default: ScenarioSummary[] }>('./index.json');
  const f = m['./index.json'];
  return f ? (await f()).default : [];
}
export async function loadScenario(id: string): Promise<Scenario> {
  const f = scenarioModules[`./scenarios/${id}.json`];
  if (!f) throw new Error(`scenario not found: ${id}`);
  return (await f()).default;
}
export async function loadReferences(): Promise<Reference[]> {
  const m = import.meta.glob<{ default: Reference[] }>('./references.json');
  const f = m['./references.json'];
  return f ? (await f()).default : [];
}
export type LocaleData = Record<Lang, { strings: Record<string, string>; notices: Record<NoticeId, string> }>;
export async function loadLocales(): Promise<LocaleData | null> {
  const m = import.meta.glob<{ default: LocaleData }>('./locales.json');
  const f = m['./locales.json'];
  return f ? (await f()).default : null;
}
export async function loadAudioManifest(): Promise<AudioAsset[]> {
  const m = import.meta.glob<{ default: AudioAsset[] }>('./audio.json');
  const f = m['./audio.json'];
  return f ? (await f()).default : [];
}
