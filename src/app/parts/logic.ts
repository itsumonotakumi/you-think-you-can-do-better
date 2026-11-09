// S05 本編・S06 文案作成で使う純粋な処理（表示のための計算だけ。状態は変えない）
import type {
  Cue, Draft, DraftSlot, GameTime, Gauges, Localized, Media, PlayState, RoleScript, Scenario,
} from '../../engine/types';
import { DEADLINE_WARN_MINUTES, SE_IDS, STAMINA_BLUR } from '../../engine/types';

// ---------------- 再開（S01・エラー画面で共通） ----------------

/** 保存した版と、読み込んだシナリオの版が違うか */
export function versionChanged(saved: PlayState, scenario: Scenario): boolean {
  return saved.scenarioVersion !== scenario.version;
}

/** ロール定義を引く。__proto__ などの継承したキーは返さない */
function roleScript(scenario: Scenario, role: string): RoleScript | undefined {
  const roles = scenario.roles as Record<string, RoleScript | undefined>;
  if (!Object.hasOwn(roles, role)) return undefined;
  return roles[role];
}

// ---------------- 時計・期限 ----------------

export function formatClock(t: GameTime): string {
  const minutes = ((t.minutes % 1440) + 1440) % 1440;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function minutesBetween(from: GameTime, to: GameTime): number {
  return (to.day - from.day) * 1440 + (to.minutes - from.minutes);
}

export interface DeadlineItem {
  id: string;
  label?: Localized;
  /** 残り分。負なら超過 */
  remaining: number;
  status: 'safe' | 'warn' | 'over';
  textKey: string;
  vars: { hours?: number; minutes?: number };
}

export function deadlineViews(state: PlayState, scenario: Scenario): DeadlineItem[] {
  const labels = new Map((roleScript(scenario, state.role)?.deadlines ?? []).map((d) => [d.id, d.label]));
  return state.deadlines
    .filter((d) => !d.done)
    .map((d) => {
      const remaining = minutesBetween(state.clock, d.dueAt);
      const status: DeadlineItem['status'] =
        remaining < 0 ? 'over' : remaining < DEADLINE_WARN_MINUTES ? 'warn' : 'safe';
      const abs = Math.abs(remaining);
      const short = abs < 60;
      const textKey = remaining < 0
        ? (short ? 'sb.deadline.overMin' : 'sb.deadline.over')
        : (short ? 'sb.deadline.remainingMin' : 'sb.deadline.remaining');
      const vars = short ? { minutes: abs } : { hours: Math.floor(abs / 60), minutes: abs % 60 };
      return { id: d.id, label: labels.get(d.id), remaining, status, textKey, vars };
    })
    .sort((a, b) => a.remaining - b.remaining);
}

// ---------------- ゲージ ----------------

export const GAUGE_ORDER = ['damage', 'flame', 'trust', 'stamina'] as const;
export type GaugeKey = (typeof GAUGE_ORDER)[number];

const LEVEL_KEY: Record<GaugeKey, (v: number) => string> = {
  damage: (v) => v >= 80 ? 'sb.level.damage.severe'
    : v >= 60 ? 'sb.level.damage.serious'
      : v >= 30 ? 'sb.level.damage.caution' : 'sb.level.damage.minor',
  flame: (v) => v >= 90 ? 'sb.level.flame.outbreak'
    : v >= 70 ? 'sb.level.flame.danger'
      : v >= 40 ? 'sb.level.flame.caution' : 'sb.level.flame.calm',
  trust: (v) => v >= 80 ? 'sb.level.trust.strong'
    : v >= 50 ? 'sb.level.trust.normal'
      : v >= 30 ? 'sb.level.trust.thin' : 'sb.level.trust.fragile',
  stamina: (v) => v >= 80 ? 'sb.level.stamina.full'
    : v >= 50 ? 'sb.level.stamina.normal'
      : v >= STAMINA_BLUR ? 'sb.level.stamina.tired' : 'sb.level.stamina.exhausted',
};

export function clampGauge(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export interface GaugeItem {
  key: GaugeKey;
  labelKey: string;
  value: number;
  levelKey: string;
}

export function gaugeViews(gauges: Gauges): GaugeItem[] {
  return GAUGE_ORDER.map((key) => {
    const value = clampGauge(gauges[key]);
    return { key, labelKey: `sb.gauge.${key}`, value, levelKey: LEVEL_KEY[key](value) };
  });
}

// ---------------- 選択肢 ----------------

/** 数字キー（1〜9）を選択肢の index に変換する。範囲外は null */
export function choiceIndexFromKey(key: string, count: number): number | null {
  if (!/^[1-9]$/.test(key)) return null;
  const index = Number(key) - 1;
  return index < count && index < 9 ? index : null;
}

export interface SplitText { normal: string; faded: string }

/** 体力が STAMINA_BLUR 未満のとき、文言の後ろ側を薄く表示するための分割 */
export function splitForFatigue(text: string, stamina: number): SplitText {
  if (stamina >= STAMINA_BLUR || text.length < 6) return { normal: text, faded: '' };
  let cut = -1;
  for (const mark of ['、', '。', '，', ',', '／', '/', '・']) {
    const i = text.lastIndexOf(mark);
    if (i > 0) cut = Math.max(cut, i + 1);
  }
  if (cut <= 0 || cut >= text.length) cut = Math.max(1, Math.floor(text.length * 2 / 3));
  if (cut >= text.length) return { normal: text, faded: '' };
  return { normal: text.slice(0, cut), faded: text.slice(cut) };
}

// ---------------- 世間の声 ----------------

/** 媒体の表示名のキー。「上司」は経営者・グループ会社社長には不自然なので、ロールで呼び名を変える */
export function mediaLabelKey(media: Media, role?: string, prefix = 'sb'): string {
  if (media === 'boss' && (role === 'executive' || role === 'officer')) return `${prefix}.media.boss_${role}`;
  return `${prefix}.media.${media}`;
}

export function mediaGlyph(media: Media): string {
  switch (media) {
    case 'sns': return '@';
    case 'news': return 'N';
    case 'board': return 'B';
    case 'chat': return 'C';
    case 'boss': return '☎';
    case 'vendor': return '✉';
    case 'attacker': return '!';
  }
}

export interface VoiceItem {
  id: string;
  media: Media;
  text: Localized;
  at: GameTime;
  pointId: string | null;
}

/** 表示済みの声を、シナリオの定義と突き合わせて返す。misleading は画面に出さない */
export function voiceViews(state: PlayState, scenario: Scenario): VoiceItem[] {
  const voices = roleScript(scenario, state.role)?.voices ?? [];
  const byId = new Map(voices.map((v) => [v.id, v]));
  const out: VoiceItem[] = [];
  for (const shown of state.voicesShown) {
    const voice = byId.get(shown.voiceId);
    if (!voice) continue;
    out.push({ id: voice.id, media: voice.media, text: voice.text, at: shown.at, pointId: shown.pointId });
  }
  return out;
}

/** 世間の声を「最新（いちばん新しい時刻に届いた声）」と「それより前」に分ける。それより前は画面で折り畳む */
export function splitVoices(items: VoiceItem[]): { latest: VoiceItem[]; older: VoiceItem[] } {
  if (items.length === 0) return { latest: [], older: [] };
  const key = (v: VoiceItem): number => v.at.day * 1440 + v.at.minutes;
  const newest = Math.max(...items.map(key));
  return { latest: items.filter((v) => key(v) === newest), older: items.filter((v) => key(v) !== newest) };
}

// ---------------- 音の字幕 ----------------

export type CueCaption =
  | { kind: 'se'; id: string }
  | { kind: 'voice'; media: Media }
  | { kind: 'text'; text: Localized; prefixKey?: string }
  | { kind: 'clock'; to: GameTime };

const SE_SET = new Set<string>(SE_IDS);

export function isKnownSe(id: string): boolean {
  return SE_SET.has(id);
}

/** 演出キューから、音・出来事の文字表示を作る（A05: 音には必ず字幕を付ける） */
export function cueCaptions(cues: Cue[]): CueCaption[] {
  const out: CueCaption[] = [];
  for (const cue of cues) {
    if (cue.kind === 'se') {
      out.push({ kind: 'se', id: cue.id });
    } else if (cue.kind === 'voice') {
      out.push({ kind: 'voice', media: cue.media });
    } else if (cue.kind === 'caption') {
      out.push({ kind: 'text', text: cue.text });
    } else if (cue.kind === 'delayedHit') {
      out.push({ kind: 'text', text: cue.reason, prefixKey: 'sb.caption.delayed' });
    } else if (cue.kind === 'clock') {
      out.push({ kind: 'clock', to: cue.to });
    }
  }
  return out;
}

export type ShownCaption = CueCaption & { captionId: number };

/** 字幕の履歴に残す件数 */
export const CAPTION_HISTORY_LIMIT = 20;

/** 演出キューの字幕に、表示用の連番を振る */
export function withCaptionIds(items: CueCaption[], startId: number): ShownCaption[] {
  return items.map((item, index) => ({ ...item, captionId: startId + index }));
}

/** 待ち行列の先頭が指定の字幕なら、履歴の先頭へ移す（先頭でなければ何もしない） */
export function shiftCaption(
  queue: ShownCaption[],
  captionId: number,
  history: ShownCaption[],
): { queue: ShownCaption[]; history: ShownCaption[] } {
  const head = queue[0];
  if (!head || head.captionId !== captionId) return { queue, history };
  return {
    queue: queue.slice(1),
    history: [head, ...history].slice(0, CAPTION_HISTORY_LIMIT),
  };
}

export interface CaptionGroup {
  caption: ShownCaption;
  count: number;
}

/**
 * 履歴を新しい順のまま、連続して同じ表示になる字幕を1件にまとめる。
 * 例: 「カメラのシャッター」が5件続いたら1件（count=5）にする。
 * limit はまとめた後の件数。数え切ってから切るので、端の件数も正しい。
 */
export function groupCaptions(
  history: readonly ShownCaption[],
  labelOf: (caption: ShownCaption) => string,
  limit: number,
): CaptionGroup[] {
  const groups: CaptionGroup[] = [];
  for (const caption of history) {
    const last = groups[groups.length - 1];
    if (last && labelOf(last.caption) === labelOf(caption)) {
      last.count += 1;
    } else {
      groups.push({ caption, count: 1 });
    }
  }
  return groups.slice(0, Math.max(0, limit));
}

// ---------------- 記録のID ----------------

/** 自由記述の記録ID。既存と重ならない free-<連番> を返す */
export function nextFreeNoteId(notes: { id: string }[]): string {
  let n = 1;
  while (notes.some((note) => note.id === `free-${n}`)) n += 1;
  return `free-${n}`;
}

// ---------------- 文案作成（S06） ----------------

export function draftFor(state: PlayState, scenario: Scenario): Draft | null {
  const key = state.pendingDraft;
  if (!key) return null;
  const drafts = roleScript(scenario, state.role)?.drafts;
  if (!drafts || !Object.hasOwn(drafts, key)) return null;
  return drafts[key] ?? null;
}

type AutoDraftItem = NonNullable<DraftSlot['items']>[number];

/** auto の部品を、開始からの経過時間で決める */
export function autoItem(slot: DraftSlot, state: PlayState, scenario: Scenario): AutoDraftItem | null {
  if (!slot.auto || !slot.items) return null;
  const elapsedHours = Math.max(0, minutesBetween(scenario.start, state.clock)) / 60;
  for (const item of slot.items) {
    if (item.when.withinHours !== undefined && elapsedHours <= item.when.withinHours) return item;
  }
  return slot.items.find((item) => item.when.otherwise) ?? null;
}

/** 部品の初期選択（auto のみ埋める） */
export function initialSelections(draft: Draft, state: PlayState, scenario: Scenario): Record<string, string> {
  const selections: Record<string, string> = {};
  for (const slot of draft.slots) {
    const item = autoItem(slot, state, scenario);
    if (item) selections[slot.id] = item.id;
  }
  return selections;
}

export interface ComposeOptions {
  separator: string;
  autoText: string;
  /** 表示用。既定は `label：text` */
  join?: (label: string, value: string) => string;
}

/** 選んだ部品から、組み上がった文を作る */
export function composeDraft(
  draft: Draft,
  selections: Record<string, string>,
  translate: (text: Localized) => string,
  options: ComposeOptions,
): string {
  const join = options.join ?? ((label, value) => `${label}：${value}`);
  const parts: string[] = [];
  for (const slot of draft.slots) {
    const selectedId = selections[slot.id];
    if (!selectedId) continue;
    const option = slot.options?.find((o) => o.id === selectedId);
    const value = option ? translate(option.text) : options.autoText;
    parts.push(join(translate(slot.label), value));
  }
  return parts.join(options.separator);
}

/** auto 以外の部品がすべて選ばれているか */
export function draftComplete(draft: Draft, selections: Record<string, string>): boolean {
  return draft.slots.every((slot) => selections[slot.id] !== undefined);
}
