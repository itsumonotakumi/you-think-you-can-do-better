// シナリオ検査 C01〜C22（C11〜C13 は実エンジンの貪欲シミュレーション）。
import {
  CATEGORY_RANGE,
  PHASES,
  ROLES,
  LANGS,
  MISLEADING_TYPES,
  BGM_IDS,
  SE_IDS,
} from '../../src/engine/types.ts';
import type { Rank, Reference, RoleId, Scenario } from '../../src/engine/types.ts';
import { locate } from './source.ts';
import { loadProject } from './project.ts';
import type { Issue, LoadedScenario, Obj, Project } from './project.ts';
import { simulatePaths } from './paths.ts';
import type { PathSimulation } from './paths.ts';

const PHASE_SET = new Set<string>(PHASES);
const ROLE_SET = new Set<string>(ROLES);
const LANG_SET = new Set<string>(LANGS);
const CATEGORY_SET = new Set<string>(Object.keys(CATEGORY_RANGE));
const BGM_SET = new Set<string>(BGM_IDS);
const SE_SET = new Set<string>(SE_IDS);
const MEDIA_SET = new Set(['sns', 'news', 'board', 'chat', 'boss', 'vendor', 'attacker']);
const AXIS_SET = new Set(['time', 'order', 'wording', 'content', 'record', 'care']);
const RANKS = ['S', 'A', 'B', 'C', 'D'];
const MISLEADING_SET = new Set<string>(MISLEADING_TYPES);

type Severity = 'error' | 'warning';

function isObj(value: unknown): value is Obj {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asObj(value: unknown): Obj {
  return isObj(value) ? value : {};
}

function isStr(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function isLocalized(value: unknown): boolean {
  if (!isObj(value)) return false;
  return Object.keys(value).some((key) => LANG_SET.has(key))
    && Object.values(value).every((v) => typeof v === 'string');
}

function report(
  out: Issue[],
  fallbackFile: string,
  value: unknown,
  key: string | number | undefined,
  code: string,
  message: string,
  severity: Severity = 'error',
): void {
  const found = key === undefined ? locate(value) : locate(value, key);
  out.push({
    file: found?.file ?? fallbackFile,
    line: found?.line ?? 1,
    code,
    message,
    severity,
  });
}

function roleFile(sc: LoadedScenario, role: string): string {
  return sc.roleSources.get(role)?.file ?? sc.file;
}

function sceneOf(sc: LoadedScenario): Obj {
  return asObj(sc.sceneSource.data);
}

function roleEntries(sc: LoadedScenario): [string, Obj][] {
  const roles = asObj(sc.scenario.roles);
  return Object.entries(roles)
    .filter(([role]) => ROLE_SET.has(role))
    .map(([role, script]) => [role, asObj(script)]);
}

function* walkStrings(
  value: unknown,
  container: unknown,
  key: string | number,
  visited: WeakSet<object> = new WeakSet(),
): Generator<{ text: string; container: unknown; key: string | number }> {
  if (typeof value === 'string') {
    yield { text: value, container, key };
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  // YAML のアンカーは循環参照を作れる。訪問済みを覚えて無限再帰を防ぐ。
  if (visited.has(value)) return;
  visited.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      yield* walkStrings(value[i], value, i, visited);
    }
    return;
  }
  for (const name of Object.keys(value)) {
    yield* walkStrings((value as Obj)[name], value, name, visited);
  }
}

function* walkObjects(value: unknown, visited: WeakSet<object> = new WeakSet()): Generator<Obj> {
  if (typeof value !== 'object' || value === null) return;
  if (visited.has(value)) return;
  visited.add(value);
  if (Array.isArray(value)) {
    for (const item of value) yield* walkObjects(item, visited);
    return;
  }
  yield value as Obj;
  for (const name of Object.keys(value)) {
    yield* walkObjects((value as Obj)[name], visited);
  }
}

function validTime(value: unknown): boolean {
  if (!isObj(value)) return false;
  const day = value.day;
  const minutes = value.minutes;
  return isInt(day) && day >= 0 && isInt(minutes) && minutes >= 0 && minutes < 24 * 60 && minutes % 15 === 0;
}

function checkGauges(gauge: unknown, onError: (key: string, message: string) => void): void {
  const obj = asObj(gauge);
  for (const key of ['damage', 'flame', 'trust', 'stamina']) {
    if (obj[key] !== undefined && !isNum(obj[key])) onError(key, `ゲージ ${key} は数値で書く`);
  }
  for (const key of Object.keys(obj)) {
    if (!['damage', 'flame', 'trust', 'stamina'].includes(key)) onError(key, `不明なゲージ ${key}`);
  }
}

function checkLocalized(value: unknown, onError: (message: string) => void): void {
  if (!isLocalized(value)) {
    onError('文言は { ja: ... } の形で書く');
    return;
  }
  const obj = asObj(value);
  if (!isStr(obj.ja) && !isStr(obj.en)) onError('文言が空');
}

// ---------------- C01 必須要素 ----------------

export function checkC01(project: Project): Issue[] {
  const out: Issue[] = [];
  for (const sc of project.scenarios) {
    const scene = sceneOf(sc);
    const file = sc.file;
    const add = (value: unknown, key: string, message: string) => report(out, file, value, key, 'C01', message);

    if (!isStr(scene.id)) add(scene, 'id', 'id がない');
    else if (scene.id !== sc.dir) add(scene, 'id', `id はフォルダ名と同じにする（${sc.dir}）`);
    if (!isStr(scene.version)) add(scene, 'version', 'version がない');
    if (!['latest', 'standard', 'retired'].includes(scene.status)) add(scene, 'status', 'status は latest | standard | retired');
    if (!isStr(scene.published)) add(scene, 'published', 'published がない');
    checkLocalized(scene.sourcePeriod, (m) => add(scene, 'sourcePeriod', m));
    if (!isInt(scene.difficulty) || scene.difficulty < 1 || scene.difficulty > 5) {
      add(scene, 'difficulty', 'difficulty は 1〜5 の整数');
    }
    if (!Array.isArray(scene.languages) || scene.languages.length === 0) {
      add(scene, 'languages', 'languages がない');
    } else {
      for (const lang of scene.languages) {
        if (!LANG_SET.has(lang)) add(scene, 'languages', `未知の言語: ${lang}`);
      }
    }
    if (!isStr(scene.referencesVersion)) add(scene, 'referencesVersion', 'referencesVersion がない');
    if (!isStr(scene.legalPack)) add(scene, 'legalPack', 'legalPack がない');
    checkLocalized(scene.title, (m) => add(scene, 'title', m));
    checkLocalized(scene.tagline, (m) => add(scene, 'tagline', m));

    const company = asObj(scene.company);
    if (!isObj(scene.company)) add(scene, 'company', 'company がない');
    checkLocalized(company.name, (m) => add(scene, 'company', m));
    checkLocalized(company.industry, (m) => add(scene, 'company', m));
    checkLocalized(company.size, (m) => add(scene, 'company', m));
    if (!Array.isArray(company.people)) add(company, 'people', 'company.people は配列');
    else {
      const ids = new Set<string>();
      for (const person of company.people) {
        const p = asObj(person);
        if (!isStr(p.id)) add(person, 'id', '人物の id がない');
        else if (ids.has(p.id)) add(person, 'id', `人物の id が重複: ${p.id}`);
        else ids.add(p.id);
        checkLocalized(p.name, (m) => add(person, 'name', m));
        checkLocalized(p.title, (m) => add(person, 'title', m));
      }
    }

    if (!validTime(scene.start)) add(scene, 'start', 'start は { day, minutes }（15分刻み）');
    const gauges = asObj(scene.initialGauges);
    if (!isObj(scene.initialGauges)) add(scene, 'initialGauges', 'initialGauges がない');
    for (const key of ['damage', 'flame', 'trust', 'stamina']) {
      const value = gauges[key];
      if (!isNum(value) || value < 0 || value > 100) add(gauges, key, `initialGauges.${key} は 0〜100 の数値`);
    }

    const audio = asObj(scene.audio);
    if (!isObj(scene.audio)) add(scene, 'audio', 'audio がない');
    if (!isStr(audio.bgmDefault)) add(audio, 'bgmDefault', 'audio.bgmDefault がない');
    else if (!BGM_SET.has(audio.bgmDefault)) add(audio, 'bgmDefault', `未知の BGM: ${audio.bgmDefault}`);
    if (audio.bgmByPhase !== undefined) {
      if (!isObj(audio.bgmByPhase)) add(audio, 'bgmByPhase', 'audio.bgmByPhase はオブジェクト');
      else {
        for (const [phase, bgm] of Object.entries(audio.bgmByPhase)) {
          if (!PHASE_SET.has(phase)) add(audio.bgmByPhase, phase, `未知のフェーズ: ${phase}`);
          if (!isStr(bgm) || !BGM_SET.has(bgm)) add(audio.bgmByPhase, phase, `未知の BGM: ${bgm}`);
        }
      }
    }

    const roles = asObj(sc.scenario.roles);
    const roleNames = Object.keys(roles);
    if (roleNames.length === 0) add(sc.scenario, 'roles', 'ロールがない（roles/<role>.yaml を置く）');
    for (const role of roleNames) {
      if (!ROLE_SET.has(role)) add(sc.scenario, 'roles', `未知のロール: ${role}`);
      else checkRole(sc, role, asObj(roles[role]), out);
    }

    for (const rank of RANKS) {
      const ending = asObj(asObj(scene.endings)[rank]);
      if (!isObj(asObj(scene.endings)[rank])) add(scene.endings, rank, `endings.${rank} がない`);
      checkLocalized(ending.text, (m) => add(ending, 'text', `endings.${rank}: ${m}`));
      if (!isStr(ending.bgm) || !BGM_SET.has(ending.bgm)) add(ending, 'bgm', `endings.${rank}.bgm が不正`);
    }

    const sales = asObj(scene.salesModel);
    if (!isObj(scene.salesModel)) add(scene, 'salesModel', 'salesModel がない');
    for (const key of ['base', 'trustWeight', 'fatalPenalty', 'min', 'max']) {
      if (!isNum(sales[key])) add(sales, key, `salesModel.${key} は数値`);
    }
    if (isNum(sales.min) && isNum(sales.max) && sales.min > sales.max) add(sales, 'min', 'salesModel.min は max 以下');

    if (scene.press !== undefined) checkPress(scene.press, out, file);

    if (scene.illustrations !== undefined) {
      if (!Array.isArray(scene.illustrations)) add(scene, 'illustrations', 'illustrations は配列');
      else {
        const ids = new Set<string>();
        for (const item of scene.illustrations) {
          const illustration = asObj(item);
          if (!isStr(illustration.id)) add(item, 'id', '挿絵の id がない');
          else if (ids.has(illustration.id)) add(item, 'id', `挿絵の id が重複: ${illustration.id}`);
          else ids.add(illustration.id);
          if (!isStr(illustration.file)) add(item, 'file', '挿絵の file がない');
          checkLocalized(illustration.alt, (m) => add(item, 'alt', m));
          checkLocalized(illustration.credit, (m) => add(item, 'credit', m));
        }
      }
    }
  }

  const refFile = project.references?.file ?? 'references/references.yaml';
  const refData = project.references?.data;
  if (refData !== undefined && refData !== null) {
    if (!Array.isArray(refData)) {
      report(out, refFile, refData, undefined, 'C01', 'references.yaml は配列で書く');
    } else {
      for (const refValue of refData) {
        const ref = asObj(refValue);
        const addRef = (value: unknown, key: string, message: string) =>
          report(out, refFile, value, key, 'C01', message);
        if (!isStr(ref.id)) addRef(refValue, 'id', '根拠の id がない');
        checkLocalized(ref.title, (m) => addRef(refValue, 'title', m));
        checkLocalized(ref.issuer, (m) => addRef(refValue, 'issuer', m));
        if (!isStr(ref.version)) addRef(refValue, 'version', '根拠の version がない');
        checkLocalized(ref.section, (m) => addRef(refValue, 'section', m));
        checkLocalized(ref.summary, (m) => addRef(refValue, 'summary', m));
        if (!isStr(ref.checkedAt)) addRef(refValue, 'checkedAt', '根拠の checkedAt がない');
        if (!isStr(ref.legalPack)) addRef(refValue, 'legalPack', '根拠の legalPack がない');
      }
    }
  }
  return out;
}

function checkRole(sc: LoadedScenario, role: string, script: Obj, out: Issue[]): void {
  const file = roleFile(sc, role);
  const add = (value: unknown, key: string, message: string) => report(out, file, value, key, 'C01', message);
  if (!isNum(script.estimateMinutes) || script.estimateMinutes <= 0) add(script, 'estimateMinutes', 'estimateMinutes は正の数');
  checkLocalized(script.intro, (m) => add(script, 'intro', m));
  if (typeof script.pressEnabled !== 'boolean') add(script, 'pressEnabled', 'pressEnabled は true/false');

  if (!Array.isArray(script.voices)) add(script, 'voices', 'voices は配列');
  else {
    const ids = new Set<string>();
    for (const voice of script.voices) {
      const v = asObj(voice);
      if (!isStr(v.id)) add(voice, 'id', '声の id がない');
      else if (ids.has(v.id)) add(voice, 'id', `声の id が重複: ${v.id}`);
      else ids.add(v.id);
      if (!MEDIA_SET.has(v.media)) add(voice, 'media', `media が不正: ${v.media}`);
      if (typeof v.misleading !== 'boolean') add(voice, 'misleading', 'misleading は true/false');
      checkLocalized(v.text, (m) => add(voice, 'text', m));
      checkTrigger(v.trigger, (m) => add(voice, 'trigger', m));
    }
  }

  const pointIds = new Set<string>();
  if (!Array.isArray(script.points)) add(script, 'points', 'points は配列');
  else {
    for (const point of script.points) {
      const p = asObj(point);
      if (!isStr(p.id)) add(point, 'id', '判断ポイントの id がない');
      else if (pointIds.has(p.id)) add(point, 'id', `判断ポイントの id が重複: ${p.id}`);
      else pointIds.add(p.id);
      if (!PHASE_SET.has(p.phase)) add(point, 'phase', `phase が不正: ${p.phase}`);
      checkLocalized(p.text, (m) => add(point, 'text', m));
      if (p.at !== undefined && !validTime(p.at)) add(point, 'at', 'at は { day, minutes }（15分刻み）');
      if (p.when !== undefined && !isObj(p.when)) add(point, 'when', 'when はオブジェクト');
      if (p.voices !== undefined && !Array.isArray(p.voices)) add(point, 'voices', 'voices は配列');
      if (p.notable !== undefined) {
        if (!Array.isArray(p.notable)) add(point, 'notable', 'notable は配列');
        else for (const note of p.notable) checkNote(note, add);
      }
      if (p.sound !== undefined) checkSound(p.sound, add);
      if (p.popular !== undefined) {
        const popular = asObj(p.popular);
        if (!isStr(popular.choiceId)) add(popular, 'choiceId', 'popular.choiceId がない');
        if (!isNum(popular.percent) || popular.percent < 0 || popular.percent > 100) {
          add(popular, 'percent', 'popular.percent は 0〜100');
        }
      }
      if (!Array.isArray(p.choices) || p.choices.length === 0) add(point, 'choices', 'choices がない');
      else {
        const choiceIds = new Set<string>();
        for (const choice of p.choices) {
          checkChoice(choice, script, add, choiceIds);
        }
      }
    }
  }

  if (script.drafts !== undefined) checkDrafts(script.drafts, add);

  if (!isObj(script.cowardVoices)) add(script, 'cowardVoices', 'cowardVoices がない');
  else {
    for (const key of ['2', '3', '4']) {
      if (!isStr(asObj(script.cowardVoices)[key])) add(script.cowardVoices, key, `cowardVoices.${key} がない`);
    }
  }

  if (script.deadlines !== undefined) {
    if (!Array.isArray(script.deadlines)) add(script, 'deadlines', 'deadlines は配列');
    else {
      const ids = new Set<string>();
      for (const deadline of script.deadlines) {
        const d = asObj(deadline);
        if (!isStr(d.id)) add(deadline, 'id', '期限の id がない');
        else if (ids.has(d.id)) add(deadline, 'id', `期限の id が重複: ${d.id}`);
        else ids.add(d.id);
        if (!isStr(d.ref)) add(deadline, 'ref', '期限の ref がない');
        checkLocalized(d.label, (m) => add(deadline, 'label', m));
        if (!isNum(d.points)) add(deadline, 'points', '期限の points は数値');
        if (!isStr(d.doneFlag)) add(deadline, 'doneFlag', '期限の doneFlag がない');
      }
    }
  }

  if (script.events !== undefined) {
    if (!Array.isArray(script.events)) add(script, 'events', 'events は配列');
    else {
      for (const event of script.events) {
        const e = asObj(event);
        if (!isStr(e.id)) add(event, 'id', '出来事の id がない');
        if (!validTime(e.at)) add(event, 'at', '出来事の at は { day, minutes }');
        if (e.voices !== undefined && !Array.isArray(e.voices)) add(event, 'voices', 'voices は配列');
        if (e.gauges !== undefined) checkGauges(e.gauges, (k, m) => add(e.gauges, k, m));
        if (e.setFlags !== undefined) checkFlags(e.setFlags, (m) => add(event, 'setFlags', m));
        if (e.sound !== undefined) checkSound(e.sound, add);
        if (e.caption !== undefined) checkLocalized(e.caption, (m) => add(event, 'caption', m));
      }
    }
  }
}

function checkTrigger(trigger: unknown, onError: (message: string) => void): void {
  const t = asObj(trigger);
  if (!isObj(trigger)) {
    onError('trigger がない');
    return;
  }
  if (t.at !== undefined) {
    if (!['point', 'after', 'manual'].includes(t.at)) onError(`trigger.at が不正: ${t.at}`);
    if (t.at === 'after' && t.choice !== undefined && !isStr(t.choice)) onError('trigger.choice は文字列');
    return;
  }
  if (t.flags !== undefined) {
    if (!isObj(t.flags)) onError('trigger.flags はオブジェクト');
    for (const [key, value] of Object.entries(t.flags)) {
      if (typeof value !== 'boolean') onError(`trigger.flags.${key} は true/false`);
    }
    return;
  }
  onError('trigger は at か flags で書く');
}

function checkNote(note: unknown, add: (value: unknown, key: string, message: string) => void): void {
  const n = asObj(note);
  if (!isStr(n.id)) add(note, 'id', '記録の id がない');
  checkLocalized(n.text, (m) => add(note, 'text', m));
}

function checkSound(sound: unknown, add: (value: unknown, key: string, message: string) => void): void {
  const s = asObj(sound);
  if (!isObj(sound)) {
    add(sound, 'se', 'sound は { se: [...] }');
    return;
  }
  if (s.se !== undefined) {
    if (!Array.isArray(s.se)) add(sound, 'se', 'sound.se は配列');
    else for (const id of s.se) if (!SE_SET.has(id)) add(sound, 'se', `未知の効果音: ${id}`);
  }
}

function checkFlags(flags: unknown, onError: (message: string) => void): void {
  if (!isObj(flags)) {
    onError('フラグはオブジェクトで書く');
    return;
  }
  for (const [key, value] of Object.entries(flags)) {
    if (typeof value !== 'boolean') onError(`フラグ ${key} は true/false`);
  }
}

function checkChoice(
  choice: unknown,
  script: Obj,
  add: (value: unknown, key: string, message: string) => void,
  choiceIds: Set<string>,
): void {
  const c = asObj(choice);
  if (!isStr(c.id)) add(choice, 'id', '選択肢の id がない');
  else if (choiceIds.has(c.id)) add(choice, 'id', `選択肢の id が重複: ${c.id}`);
  else choiceIds.add(c.id);
  checkLocalized(c.text, (m) => add(choice, 'text', m));
  if (!isInt(c.minutes) || c.minutes <= 0 || c.minutes % 15 !== 0) add(choice, 'minutes', 'minutes は 15 の倍数');
  if (!CATEGORY_SET.has(c.category)) add(choice, 'category', `category が不正: ${c.category}`);
  if (!isNum(c.points)) add(choice, 'points', 'points は数値');
  if (!Array.isArray(c.refs)) add(choice, 'refs', 'refs は配列');
  if (c.gauges !== undefined) checkGauges(c.gauges, (k, m) => add(c.gauges, k, m));
  if (c.coward !== undefined && typeof c.coward !== 'boolean') add(choice, 'coward', 'coward は true/false');
  if (c.setFlags !== undefined) checkFlags(c.setFlags, (m) => add(choice, 'setFlags', m));
  if (c.fatalAlternate !== undefined && !isNum(c.fatalAlternate)) add(choice, 'fatalAlternate', 'fatalAlternate は数値');
  if (c.detail !== undefined) {
    const drafts = asObj(script.drafts);
    if (!isStr(c.detail) || !isObj(drafts[c.detail])) add(choice, 'detail', `detail の drafts キーがない: ${c.detail}`);
  }
  if (c.delayed !== undefined) {
    if (!Array.isArray(c.delayed)) add(choice, 'delayed', 'delayed は配列');
    else for (const delayed of c.delayed) checkDelayed(delayed, add);
  }
  if (c.items !== undefined) {
    if (!Array.isArray(c.items)) add(choice, 'items', 'items は配列');
    else for (const item of c.items) checkDetailItem(item, add, false);
  }
}

function checkDelayed(delayed: unknown, add: (value: unknown, key: string, message: string) => void): void {
  const d = asObj(delayed);
  if (!isInt(d.afterPhases) || d.afterPhases < 1) add(delayed, 'afterPhases', 'afterPhases は 1 以上の整数');
  if (d.points !== undefined && !isNum(d.points)) add(delayed, 'points', 'points は数値');
  if (d.gauges !== undefined) checkGauges(d.gauges, (k, m) => add(d.gauges, k, m));
  checkLocalized(d.reason, (m) => add(delayed, 'reason', m));
}

function checkDetailItem(
  item: unknown,
  add: (value: unknown, key: string, message: string) => void,
  draftItem: boolean,
): void {
  const i = asObj(item);
  if (!isStr(i.id)) add(item, 'id', '細目の id がない');
  if (!isNum(i.points)) add(item, 'points', '細目の points は数値');
  if (!AXIS_SET.has(i.axis)) add(item, 'axis', `axis が不正: ${i.axis}`);
  if (!Array.isArray(i.refs)) add(item, 'refs', 'refs は配列');
  if (draftItem) {
    if (!isObj(i.when) && !isLocalized(i.text)) add(item, 'when', '文案の部品は when か text が要る');
    if (i.when !== undefined) {
      const when = asObj(i.when);
      if (when.withinHours !== undefined && !isNum(when.withinHours)) add(item, 'when', 'withinHours は数値');
      if (when.otherwise !== undefined && typeof when.otherwise !== 'boolean') add(item, 'when', 'otherwise は true/false');
    }
    if (i.text !== undefined) checkLocalized(i.text, (m) => add(item, 'text', m));
    if (i.delayed !== undefined) checkDelayed(i.delayed, add);
  }
}

function checkDrafts(drafts: unknown, add: (value: unknown, key: string, message: string) => void): void {
  if (!isObj(drafts)) {
    add(drafts, 'drafts', 'drafts はオブジェクト');
    return;
  }
  for (const [key, value] of Object.entries(drafts)) {
    const draft = asObj(value);
    checkLocalized(draft.title, (m) => add(value, 'title', `${key}: ${m}`));
    if (!Array.isArray(draft.slots) || draft.slots.length === 0) {
      add(value, 'slots', `${key}: slots がない`);
      continue;
    }
    const slotIds = new Set<string>();
    for (const slotValue of draft.slots) {
      const slot = asObj(slotValue);
      if (!isStr(slot.id)) add(slotValue, 'id', '部品の id がない');
      else if (slotIds.has(slot.id)) add(slotValue, 'id', `部品の id が重複: ${slot.id}`);
      else slotIds.add(slot.id);
      checkLocalized(slot.label, (m) => add(slotValue, 'label', m));
      if (slot.auto !== undefined && typeof slot.auto !== 'boolean') add(slotValue, 'auto', 'auto は true/false');
      const hasItems = Array.isArray(slot.items);
      const hasOptions = Array.isArray(slot.options);
      if (hasItems === hasOptions) add(slotValue, 'items', 'items と options のどちらか一方を書く');
      if (hasItems) for (const item of slot.items) checkDetailItem(item, add, true);
      if (hasOptions) for (const item of slot.options) checkDetailItem(item, add, true);
    }
  }
}

function checkPress(press: unknown, out: Issue[], fallbackFile: string): void {
  const p = asObj(press);
  const add = (value: unknown, key: string, message: string) => report(out, fallbackFile, value, key, 'C01', message);
  if (!Array.isArray(p.questions) || p.questions.length === 0) {
    add(press, 'questions', 'press.questions がない');
    return;
  }
  const questionIds = new Set<string>();
  const checkQuestion = (value: unknown) => {
    const q = asObj(value);
    if (!isStr(q.id)) add(value, 'id', '質問の id がない');
    else if (questionIds.has(q.id)) add(value, 'id', `質問の id が重複: ${q.id}`);
    else questionIds.add(q.id);
    checkLocalized(q.text, (m) => add(value, 'text', m));
    if (q.seconds !== undefined && (!isNum(q.seconds) || q.seconds < 20 || q.seconds > 45)) {
      add(value, 'seconds', 'seconds は 20〜45');
    }
    if (q.timeoutPoints !== undefined && !isNum(q.timeoutPoints)) add(value, 'timeoutPoints', 'timeoutPoints は数値');
    if (!Array.isArray(q.answers) || q.answers.length === 0) add(value, 'answers', 'answers がない');
    else {
      const answerIds = new Set<string>();
      for (const answer of q.answers) {
        const a = asObj(answer);
        if (!isStr(a.id)) add(answer, 'id', '回答の id がない');
        else if (answerIds.has(a.id)) add(answer, 'id', `回答の id が重複: ${a.id}`);
        else answerIds.add(a.id);
        checkLocalized(a.text, (m) => add(answer, 'text', m));
        if (!isNum(a.points)) add(answer, 'points', '回答の points は数値');
        if (a.requiresNote !== undefined && a.requiresNote !== false && !isStr(a.requiresNote)) {
          add(answer, 'requiresNote', 'requiresNote は文字列か false');
        }
      }
    }
  };
  for (const question of p.questions) checkQuestion(question);
  if (p.extraQuestions !== undefined) {
    if (!Array.isArray(p.extraQuestions)) add(press, 'extraQuestions', 'extraQuestions は配列');
    else for (const extra of p.extraQuestions) {
      const e = asObj(extra);
      if (!isObj(e.when)) add(extra, 'when', 'when がない');
      checkQuestion(e.question);
    }
  }
}

// ---------------- C02 判断ポイント数 ----------------

export function checkC02(project: Project): Issue[] {
  const out: Issue[] = [];
  for (const sc of project.scenarios) {
    for (const [role, script] of roleEntries(sc)) {
      const points = script.points;
      if (!Array.isArray(points)) continue;
      const min = 15;
      const max = role === 'executive' ? 18 : 25;
      if (points.length < min || points.length > max) {
        report(out, roleFile(sc, role), script, 'points', 'C02',
          `判断ポイントは ${min}〜${max} 個（いま ${points.length} 個）`);
      }
    }
  }
  return out;
}

// ---------------- C03 細目数 ----------------

export function countDetails(script: Obj): number {
  let count = 0;
  if (Array.isArray(script.points)) {
    for (const point of script.points) {
      const choices = asObj(point).choices;
      if (!Array.isArray(choices)) continue;
      for (const choice of choices) {
        const items = asObj(choice).items;
        if (Array.isArray(items)) count += items.length;
      }
    }
  }
  const drafts = asObj(script.drafts);
  for (const draft of Object.values(drafts)) {
    const slots = asObj(draft).slots;
    if (!Array.isArray(slots)) continue;
    for (const slot of slots) {
      const s = asObj(slot);
      if (Array.isArray(s.items)) count += s.items.length;
      if (Array.isArray(s.options)) count += s.options.length;
    }
  }
  return count;
}

export function checkC03(project: Project): Issue[] {
  const out: Issue[] = [];
  for (const sc of project.scenarios) {
    for (const [role, script] of roleEntries(sc)) {
      if (!Array.isArray(script.points)) continue;
      const count = countDetails(script);
      if (count < 80) {
        report(out, roleFile(sc, role), script, 'points', 'C03',
          `細目はロールごとに 80 個以上（いま ${count} 個）`);
      }
    }
  }
  return out;
}

// ---------------- C04 細目の点数 ----------------

export function checkC04(project: Project): Issue[] {
  const out: Issue[] = [];
  for (const sc of project.scenarios) {
    for (const [role, script] of roleEntries(sc)) {
      const file = roleFile(sc, role);
      const checkItem = (item: unknown) => {
        const i = asObj(item);
        if (!isNum(i.points)) return;
        if (!Number.isInteger(i.points) || Math.abs(i.points) < 1 || Math.abs(i.points) > 20) {
          report(out, file, item, 'points', 'C04', `細目の点数は ±1〜20（いま ${i.points}）`);
        }
      };
      if (Array.isArray(script.points)) {
        for (const point of script.points) {
          const choices = asObj(point).choices;
          if (!Array.isArray(choices)) continue;
          for (const choice of choices) {
            const items = asObj(choice).items;
            if (Array.isArray(items)) items.forEach(checkItem);
          }
        }
      }
      const drafts = asObj(script.drafts);
      for (const draft of Object.values(drafts)) {
        const slots = asObj(draft).slots;
        if (!Array.isArray(slots)) continue;
        for (const slot of slots) {
          const s = asObj(slot);
          if (Array.isArray(s.items)) s.items.forEach(checkItem);
          if (Array.isArray(s.options)) s.options.forEach(checkItem);
        }
      }
    }
  }
  return out;
}

// ---------------- C05 点数区分 ----------------

export function checkC05(project: Project): Issue[] {
  const out: Issue[] = [];
  for (const sc of project.scenarios) {
    for (const [role, script] of roleEntries(sc)) {
      const file = roleFile(sc, role);
      if (!Array.isArray(script.points)) continue;
      for (const point of script.points) {
        const choices = asObj(point).choices;
        if (!Array.isArray(choices)) continue;
        for (const choice of choices) {
          const c = asObj(choice);
          if (!CATEGORY_SET.has(c.category) || !isNum(c.points)) continue;
          const range = CATEGORY_RANGE[c.category as keyof typeof CATEGORY_RANGE];
          if (!range) continue;
          if (c.points < range[0] || c.points > range[1]) {
            report(out, file, choice, 'points', 'C05',
              `category ${c.category} の点数は ${range[0]}〜${range[1]}（いま ${c.points}）`);
          }
        }
      }
    }
  }
  return out;
}

// ---------------- C06 根拠の紐づけ ----------------

export function checkC06(project: Project): Issue[] {
  const out: Issue[] = [];
  const refs = project.referencesById;
  for (const sc of project.scenarios) {
    for (const [role, script] of roleEntries(sc)) {
      const file = roleFile(sc, role);
      const checkRefs = (value: unknown, label: string) => {
        const obj = asObj(value);
        if (!Array.isArray(obj.refs)) return;
        if (obj.refs.length === 0) {
          report(out, file, value, 'refs', 'C06', `${label}に根拠IDがない`);
          return;
        }
        for (const ref of obj.refs) {
          if (!isStr(ref) || !refs.has(ref)) {
            report(out, file, value, 'refs', 'C06', `${label}の根拠IDが references にない: ${ref}`);
          }
        }
      };
      if (Array.isArray(script.points)) {
        for (const point of script.points) {
          const choices = asObj(point).choices;
          if (!Array.isArray(choices)) continue;
          for (const choice of choices) {
            const c = asObj(choice);
            checkRefs(choice, '選択肢');
            if (Array.isArray(c.items)) c.items.forEach((item) => checkRefs(item, '細目'));
          }
        }
      }
      const drafts = asObj(script.drafts);
      for (const draft of Object.values(drafts)) {
        const slots = asObj(draft).slots;
        if (!Array.isArray(slots)) continue;
        for (const slot of slots) {
          const s = asObj(slot);
          if (Array.isArray(s.items)) s.items.forEach((item) => checkRefs(item, '文案の部品'));
          if (Array.isArray(s.options)) s.options.forEach((item) => checkRefs(item, '文案の部品'));
        }
      }
    }
  }
  return out;
}

// ---------------- C07 ミスリードの量 ----------------

export function checkC07(project: Project): Issue[] {
  const out: Issue[] = [];
  for (const sc of project.scenarios) {
    for (const [role, script] of roleEntries(sc)) {
      if (!Array.isArray(script.points) || script.points.length === 0) continue;
      const misleading = new Set<string>();
      if (Array.isArray(script.voices)) {
        for (const voice of script.voices) {
          const v = asObj(voice);
          if (v.misleading === true && isStr(v.id)) misleading.add(v.id);
        }
      }
      let covered = 0;
      for (const point of script.points) {
        const voices = asObj(point).voices;
        if (Array.isArray(voices) && voices.some((id) => misleading.has(id))) covered += 1;
      }
      if (covered * 2 < script.points.length) {
        report(out, roleFile(sc, role), script, 'points', 'C07',
          `ミスリードの声がある判断ポイントが半数未満（${covered}/${script.points.length}）`);
      }
    }
  }
  return out;
}

// ---------------- C08 ミスリードの型 ----------------

export function checkC08(project: Project): Issue[] {
  const out: Issue[] = [];
  for (const sc of project.scenarios) {
    const types = new Set<string>();
    for (const [role, script] of roleEntries(sc)) {
      if (!Array.isArray(script.voices)) continue;
      for (const voice of script.voices) {
        const v = asObj(voice);
        if (v.misleading !== true) continue;
        if (!isStr(v.type)) {
          report(out, roleFile(sc, role), voice, 'type', 'C08', 'misleading の声には type が要る');
          continue;
        }
        if (!MISLEADING_SET.has(v.type)) {
          report(out, roleFile(sc, role), voice, 'type', 'C08', `未知のミスリード型: ${v.type}`);
          continue;
        }
        types.add(v.type);
      }
    }
    if (types.size < 8) {
      report(out, sc.file, sc.scenario, undefined, 'C08',
        `ミスリードの型は 8 種以上（いま ${types.size} 種）`);
    }
  }
  return out;
}

// ---------------- C09 臆病への批判 ----------------

export function checkC09(project: Project): Issue[] {
  const out: Issue[] = [];
  for (const sc of project.scenarios) {
    for (const [role, script] of roleEntries(sc)) {
      const file = roleFile(sc, role);
      let hasCowardChoice = false;
      if (Array.isArray(script.points)) {
        for (const point of script.points) {
          const choices = asObj(point).choices;
          if (!Array.isArray(choices)) continue;
          if (choices.some((choice) => asObj(choice).coward === true)) hasCowardChoice = true;
        }
      }
      if (!hasCowardChoice) {
        report(out, file, script, 'points', 'C09', 'coward: true の選択肢がない');
      }
      const voiceIds = new Set<string>();
      if (Array.isArray(script.voices)) {
        for (const voice of script.voices) {
          const v = asObj(voice);
          if (isStr(v.id)) voiceIds.add(v.id);
        }
      }
      const cowardVoices = asObj(script.cowardVoices);
      for (const key of ['2', '3', '4']) {
        const id = cowardVoices[key];
        if (!isStr(id)) report(out, file, script.cowardVoices, key, 'C09', `臆病ゲージの声 cowardVoices.${key} がない`);
        else if (!voiceIds.has(id)) report(out, file, script.cowardVoices, key, 'C09', `臆病ゲージの声が voices にない: ${id}`);
      }
    }
  }
  return out;
}

// ---------------- C10 正しい対応直後の批判 ----------------

export function checkC10(project: Project): Issue[] {
  const out: Issue[] = [];
  for (const sc of project.scenarios) {
    for (const [role, script] of roleEntries(sc)) {
      const positive = new Set<string>();
      if (Array.isArray(script.points)) {
        for (const point of script.points) {
          const choices = asObj(point).choices;
          if (!Array.isArray(choices)) continue;
          for (const choice of choices) {
            const c = asObj(choice);
            if (isStr(c.id) && isNum(c.points) && c.points > 0) positive.add(c.id);
          }
        }
      }
      let found = false;
      if (Array.isArray(script.voices)) {
        for (const voice of script.voices) {
          const v = asObj(voice);
          const trigger = asObj(v.trigger);
          if (trigger.at !== 'after') continue;
          if (trigger.choice === undefined || (isStr(trigger.choice) && positive.has(trigger.choice))) {
            found = true;
            break;
          }
        }
      }
      if (!found) {
        report(out, roleFile(sc, role), script, 'voices', 'C10',
          '正しい選択の直後に批判の声（trigger.at: after）がない');
      }
    }
  }
  return out;
}

// ---------------- C14 文言の欠け ----------------

export function checkC14(project: Project): Issue[] {
  const out: Issue[] = [];
  for (const sc of project.scenarios) {
    const languages = Array.isArray(sc.scenario.languages)
      ? sc.scenario.languages.filter((lang: unknown): lang is string => isStr(lang) && LANG_SET.has(lang))
      : [];
    if (languages.length === 0) continue;
    for (const obj of walkObjects(sc.scenario)) {
      if (!isLocalized(obj)) continue;
      for (const lang of languages) {
        if (!(lang in obj)) {
          report(out, sc.file, obj, undefined, 'C14', `文言がない: ${lang}`);
        } else if (!isStr(obj[lang])) {
          report(out, sc.file, obj, lang, 'C14', `文言が空: ${lang}`);
        }
      }
    }
  }
  return out;
}

// ---------------- C15 法定期限 ----------------

export function checkC15(project: Project): Issue[] {
  const out: Issue[] = [];
  for (const [id, ref] of project.referencesById) {
    if (ref.deadlineHours !== undefined && (!isNum(ref.deadlineHours) || ref.deadlineHours <= 0)) {
      report(out, project.references?.file ?? 'references/references.yaml', ref, 'deadlineHours', 'C15',
        `${id}: deadlineHours は正の数`);
    }
  }
  for (const sc of project.scenarios) {
    for (const [role, script] of roleEntries(sc)) {
      if (!Array.isArray(script.deadlines)) continue;
      const file = roleFile(sc, role);
      for (const deadline of script.deadlines) {
        const d = asObj(deadline);
        for (const key of ['hours', 'hour', 'deadlineHours']) {
          if (Object.prototype.hasOwnProperty.call(d, key)) {
            report(out, file, deadline, key, 'C15', '期限の時間は references の deadlineHours に書く');
          }
        }
        if (!isStr(d.ref)) continue;
        const ref = project.referencesById.get(d.ref);
        if (!ref) {
          report(out, file, deadline, 'ref', 'C15', `期限の根拠が references にない: ${d.ref}`);
        } else if (!isNum(ref.deadlineHours) || ref.deadlineHours <= 0) {
          report(out, file, deadline, 'ref', 'C15', `根拠 ${d.ref} に deadlineHours がない`);
        }
      }
    }
  }
  return out;
}

// ---------------- C16 実名の混入 / C20 実在企業との比較 ----------------

/** 照合用に正規化する（NFKC・空白とゼロ幅文字を除去・小文字化）。 */
export function normalizeForMatch(text: string): string {
  return text.normalize('NFKC').replace(/[\s\u200b-\u200d\ufeff]/gu, '').toLowerCase();
}

interface ScanTarget {
  root: unknown;
  file: string;
}

/** C16・C17・C20 が走査する範囲（シナリオ・locales・音素材）。 */
function scanTargets(project: Project, includeScenarios = true): ScanTarget[] {
  const targets: ScanTarget[] = [];
  if (includeScenarios) {
    for (const sc of project.scenarios) targets.push({ root: sc.scenario, file: sc.file });
  }
  for (const lang of LANGS) {
    const data = project.locales[lang];
    if (!data) continue;
    targets.push({ root: data.notices, file: `locales/${lang}/notices.yaml` });
    targets.push({ root: data.strings, file: `locales/${lang}/ui` });
  }
  if (project.audioManifest) {
    targets.push({ root: project.audioManifest.data, file: project.audioManifest.file });
  }
  return targets;
}

/** クレジットの作者名と、作品名そのものは C16 の対象外にする。 */
const C16_SKIP_KEYS: ReadonlySet<string> = new Set(['author', 'creditText', 'sa.title.product']);

function denyTerms(project: Project): { label: string; term: string }[] {
  const list: { label: string; term: string }[] = [];
  for (const term of project.denylist.companies) list.push({ label: '企業名', term });
  for (const term of project.denylist.services) list.push({ label: 'サービス名', term });
  for (const term of project.denylist.people) list.push({ label: '人物名', term });
  for (const term of project.denylist.countries) list.push({ label: '国名', term });
  return list;
}

export function checkC16(project: Project): Issue[] {
  const out: Issue[] = [];
  const terms = denyTerms(project)
    .map(({ label, term }) => ({ label, term, normalized: normalizeForMatch(term) }))
    .filter(({ normalized }) => normalized.length > 0);
  if (terms.length === 0) return out;
  for (const target of scanTargets(project)) {
    for (const { text, container, key } of walkStrings(target.root, null, '')) {
      if (typeof key === 'string' && C16_SKIP_KEYS.has(key)) continue;
      const normalized = normalizeForMatch(text);
      for (const { label, term, normalized: needle } of terms) {
        if (normalized.includes(needle)) {
          report(out, target.file, container, key, 'C16', `${label}の禁止語が含まれる: ${term}`);
        }
      }
    }
  }
  return out;
}

function validComparisons(project: Project): RegExp[] {
  const result: RegExp[] = [];
  for (const pattern of project.denylist.comparisons) {
    try {
      result.push(new RegExp(pattern));
    } catch {
      // 不正な正規表現は loadDenylist が C20 として報告する
    }
  }
  return result;
}

export function checkC20(project: Project): Issue[] {
  const out: Issue[] = [];
  const patterns = validComparisons(project);
  if (patterns.length === 0) return out;
  for (const target of scanTargets(project)) {
    for (const { text, container, key } of walkStrings(target.root, null, '')) {
      const normalized = normalizeForMatch(text);
      if (patterns.some((pattern) => pattern.test(normalized))) {
        report(out, target.file, container, key, 'C20', '実在企業との比較表現がある');
      }
    }
  }
  return out;
}

// ---------------- C17 YAML の書式（＋文章中の HTML） ----------------

export function checkC17(project: Project): Issue[] {
  const out: Issue[] = [];
  const scan = (root: unknown, fallback: string) => {
    for (const { text, container, key } of walkStrings(root, null, '')) {
      if (/<[^>]*>/.test(text)) {
        report(out, fallback, container, key, 'C17', '文章に HTML（<...>）を含めない');
      }
    }
  };
  for (const sc of project.scenarios) scan(sc.scenario, sc.file);
  if (project.references) scan(project.references.data, project.references.file);
  for (const target of scanTargets(project, false)) {
    if (target.root === undefined || target.root === null) continue;
    scan(target.root, target.file);
  }
  return out;
}

// ---------------- C18 想定プレイ時間（警告のみ） ----------------

export function checkC18(project: Project): Issue[] {
  const out: Issue[] = [];
  for (const sc of project.scenarios) {
    for (const [role, script] of roleEntries(sc)) {
      if (!Array.isArray(script.points) || !isNum(script.estimateMinutes)) continue;
      let chars = 0;
      for (const point of script.points) {
        const p = asObj(point);
        const text = asObj(p.text);
        if (isStr(text.ja)) chars += text.ja.length;
        const choices = p.choices;
        if (!Array.isArray(choices)) continue;
        for (const choice of choices) {
          const c = asObj(choice);
          const choiceText = asObj(c.text);
          if (isStr(choiceText.ja)) chars += choiceText.ja.length;
        }
      }
      const estimate = chars / 500 + script.points.length;
      const target = script.estimateMinutes;
      if (estimate >= target * 2 || target >= estimate * 2) {
        report(out, roleFile(sc, role), script, 'estimateMinutes', 'C18',
          `見積もり ${estimate.toFixed(1)} 分と estimateMinutes ${target} 分が2倍以上ずれている（警告）`, 'warning');
      }
    }
  }
  return out;
}

// ---------------- C19 犯罪者の注記 / C21 高得点の注記 ----------------

export function checkC19(project: Project): Issue[] {
  const out: Issue[] = [];
  for (const sc of project.scenarios) {
    const languages = Array.isArray(sc.scenario.languages)
      ? sc.scenario.languages.filter((lang: unknown): lang is string => isStr(lang))
      : [];
    for (const lang of languages) {
      const notices = project.locales[lang]?.notices ?? {};
      if (!isStr(notices.criminal)) {
        report(out, `locales/${lang}/notices.yaml`, null, undefined, 'C19',
          '犯罪者の注記（notice.criminal）がない');
      }
    }
  }
  return out;
}

export function checkC21(project: Project): Issue[] {
  const out: Issue[] = [];
  for (const sc of project.scenarios) {
    if (Object.prototype.hasOwnProperty.call(sc.sceneSource.data ?? {}, 'notices')) {
      report(out, sc.file, sc.sceneSource.data, 'notices', 'C21', '注記は locales 側で持ち、シナリオで上書きしない');
    }
    const languages = Array.isArray(sc.scenario.languages)
      ? sc.scenario.languages.filter((lang: unknown): lang is string => isStr(lang))
      : [];
    for (const lang of languages) {
      const notices = project.locales[lang]?.notices ?? {};
      if (!isStr(notices.score)) {
        report(out, `locales/${lang}/notices.yaml`, null, undefined, 'C21',
          '高得点の注記（notice.score）がない');
      }
    }
  }
  return out;
}

// ---------------- C22 音素材 ----------------

const AUDIO_STRING_FIELDS = ['id', 'file', 'title', 'author', 'site', 'url', 'termsUrl', 'termsCheckedAt'];
const AUDIO_BOOLEAN_FIELDS = ['game', 'free', 'modify', 'creditRequired', 'themeOk'];

export function checkC22(project: Project): Issue[] {
  const out: Issue[] = [];
  const file = project.audioManifest?.file ?? 'audio/audio-manifest.yaml';
  const raw = project.audioManifest?.data;
  const entries = raw === undefined || raw === null ? [] : raw;
  if (!Array.isArray(entries)) {
    report(out, file, raw, undefined, 'C22', 'audio-manifest.yaml は配列で書く');
    return out;
  }

  const declaredFiles = new Set<string>();
  const ids = new Set<string>();
  const todayMs = Date.parse(`${project.today}T00:00:00Z`);

  entries.forEach((entryValue) => {
    const entry = asObj(entryValue);
    for (const field of AUDIO_STRING_FIELDS) {
      if (!isStr(entry[field])) report(out, file, entryValue, field, 'C22', `音素材の ${field} がない`);
    }
    if (!['bgm', 'se', 'ambience'].includes(entry.kind)) report(out, file, entryValue, 'kind', 'C22', `kind が不正: ${entry.kind}`);
    if (typeof entry.loop !== 'boolean') report(out, file, entryValue, 'loop', 'C22', 'loop は true/false');
    if (isStr(entry.id)) {
      if (ids.has(entry.id)) report(out, file, entryValue, 'id', 'C22', `音素材の id が重複: ${entry.id}`);
      ids.add(entry.id);
    }
    if (isStr(entry.file)) {
      if (declaredFiles.has(entry.file)) report(out, file, entryValue, 'file', 'C22', `音素材の file が重複: ${entry.file}`);
      declaredFiles.add(entry.file);
      if (!project.audioFiles.includes(entry.file)) {
        report(out, file, entryValue, 'file', 'C22', `manifest にある音声ファイルがない: audio/${entry.file}`);
      }
    }
    const conditions = asObj(entry.conditions);
    if (!isObj(entry.conditions)) report(out, file, entryValue, 'conditions', 'C22', 'conditions がない');
    for (const field of AUDIO_BOOLEAN_FIELDS) {
      if (typeof conditions[field] !== 'boolean') {
        report(out, file, entryValue, 'conditions', 'C22', `conditions.${field} は true/false`);
      }
    }
    if (typeof conditions.redistribution !== 'string' || conditions.redistribution.length === 0) {
      report(out, file, entryValue, 'conditions', 'C22', 'conditions.redistribution がない');
    }
    for (const field of ['game', 'free', 'themeOk']) {
      if (conditions[field] !== true) report(out, file, entryValue, 'conditions', 'C22', `conditions.${field} が true でない`);
    }
    if (conditions.creditRequired === true && !isStr(conditions.creditText)) {
      report(out, file, entryValue, 'conditions', 'C22', 'creditRequired が true なのに creditText が空');
    }
    if (isStr(entry.termsCheckedAt)) {
      const checkedMs = Date.parse(`${entry.termsCheckedAt}T00:00:00Z`);
      if (!Number.isFinite(checkedMs)) {
        report(out, file, entryValue, 'termsCheckedAt', 'C22', 'termsCheckedAt は YYYY-MM-DD');
      } else if (Number.isFinite(todayMs) && todayMs - checkedMs > 365 * 24 * 60 * 60 * 1000) {
        report(out, file, entryValue, 'termsCheckedAt', 'C22', '規約の確認日が1年以上前');
      }
    }
  });

  for (const audioFile of project.audioFiles) {
    if (!declaredFiles.has(audioFile)) {
      report(out, `audio/${audioFile}`, null, undefined, 'C22', 'manifest にない音声ファイル');
    }
  }
  return out;
}

// ---------------- C11〜C13 経路シミュレーション ----------------
//
// 実エンジンを貪欲に走らせた結果を使う簡略版。厳密な全経路探索はしない。
// 同じプロジェクトでは1回だけ走らせて C11〜C13 で共有する。

const simulations = new WeakMap<Project, Map<string, PathSimulation>>();

function simulationFor(
  project: Project,
  sc: LoadedScenario,
  role: string,
  script: Obj,
): PathSimulation | null {
  if (!Array.isArray(script.points) || script.points.length === 0) return null;

  let byKey = simulations.get(project);
  if (!byKey) {
    byKey = new Map<string, PathSimulation>();
    simulations.set(project, byKey);
  }
  const key = `${sc.id}/${role}`;
  const cached = byKey.get(key);
  if (cached) return cached;

  const refs = Array.isArray(project.references?.data)
    ? (project.references.data as Reference[])
    : [];
  let simulation: PathSimulation;
  try {
    simulation = simulatePaths(sc.scenario as unknown as Scenario, refs, role as RoleId);
  } catch (error) {
    simulation = {
      runs: [],
      failures: [{ label: '全体', message: error instanceof Error ? error.message : String(error) }],
    };
  }
  byKey.set(key, simulation);
  return simulation;
}

export function checkC11(project: Project): Issue[] {
  const out: Issue[] = [];
  for (const sc of project.scenarios) {
    for (const [role, script] of roleEntries(sc)) {
      const simulation = simulationFor(project, sc, role, script);
      if (!simulation || simulation.runs.length === 0) continue;
      const ranks = new Set(simulation.runs.map((run) => run.rank));
      const file = roleFile(sc, role);
      if (!ranks.has('S') || !ranks.has('D')) {
        const missing = (['S', 'A', 'B', 'C', 'D'] as Rank[])
          .filter((rank) => !ranks.has(rank))
          .join(', ');
        report(out, file, script, 'points', 'C11', `到達できないランクがある: ${missing}`);
      }
      if (!(['A', 'B', 'C'] as Rank[]).some((rank) => ranks.has(rank))) {
        report(out, file, script, 'points', 'C11', 'A/B/C のいずれにも到達しない（警告）', 'warning');
      }
    }
  }
  return out;
}

export function checkC12(project: Project): Issue[] {
  const out: Issue[] = [];
  for (const sc of project.scenarios) {
    for (const [role, script] of roleEntries(sc)) {
      const simulation = simulationFor(project, sc, role, script);
      if (!simulation) continue;
      for (const run of simulation.runs) {
        if (run.fatal && run.rank === 'S') {
          report(out, roleFile(sc, role), script, 'points', 'C12',
            `致命的な失点を含む経路で S に到達する: ${run.label}`);
        }
      }
    }
  }
  return out;
}

export function checkC13(project: Project): Issue[] {
  const out: Issue[] = [];
  for (const sc of project.scenarios) {
    for (const [role, script] of roleEntries(sc)) {
      const simulation = simulationFor(project, sc, role, script);
      if (!simulation) continue;
      const file = roleFile(sc, role);
      for (const failure of simulation.failures) {
        report(out, file, script, 'points', 'C13',
          `経路シミュレーションが失敗した: ${failure.label}（${failure.message}）`);
      }
      for (const run of simulation.runs) {
        if (!run.finished) {
          report(out, file, script, 'points', 'C13', `エンディングに着かない経路がある: ${run.label}`);
        }
      }
    }
  }
  return out;
}

// ---------------- 実行 ----------------

export interface ValidationResult {
  errors: Issue[];
  warnings: Issue[];
}

const CHECKS = [
  checkC01,
  checkC02,
  checkC03,
  checkC04,
  checkC05,
  checkC06,
  checkC07,
  checkC08,
  checkC09,
  checkC10,
  checkC11,
  checkC12,
  checkC13,
  checkC14,
  checkC15,
  checkC16,
  checkC17,
  checkC18,
  checkC19,
  checkC20,
  checkC21,
  checkC22,
];

export function runChecks(project: Project): ValidationResult {
  const all: Issue[] = [...project.loadIssues];
  for (const check of CHECKS) {
    all.push(...check(project));
  }
  all.sort((a, b) => {
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    if (a.line !== b.line) return a.line - b.line;
    return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
  });
  return {
    errors: all.filter((issue) => issue.severity === 'error'),
    warnings: all.filter((issue) => issue.severity === 'warning'),
  };
}

export interface ValidateOptions {
  root: string;
  today?: string;
}

export function validateProject(options: ValidateOptions): ValidationResult {
  const project = loadProject(options);
  // シナリオが1本も無いときは、検査対象が無いので通す（空の出力を作る）。
  if (project.scenarios.length === 0) return { errors: [], warnings: [] };
  return runChecks(project);
}
