// 共有契約（Wave0 で固定）。変更はオーケストレーターのみ。
// 設計書: docs/detailed-design-ja.md 4〜6章, 8〜10章
//
// 【設計書の穴を埋める決め事】
// - YAML: scenarios/<id>/scenario.yaml（roles 以外）+ scenarios/<id>/roles/<role>.yaml（RoleScript）。
//   build-data が結合して Scenario(JSON) にする。YAML と JSON は同じ型。
// - v1 のシナリオ本文は languages: [ja] のみ（Localized の en は空文字可。UI 文言は ja/en 両方）
// - 進行: points を配列順に見て、現在より後ろで when を満たす最初の点が次の判断。
//   無ければ pressEnabled なら記者会見、そうでなければエンディング。
// - フェーズ: 次の判断ポイントの phase を state.phase に入れる。PHASES の index が増えたら「フェーズが変わった」。
// - 遅れて来る効果: dueAtPhaseIndex = 予約時の PHASES.indexOf(phase) + afterPhases。
//   フェーズが変わった時、および エンディング計算前に、due <= 現在 index のものを適用（エンディング前は全部適用）。
// - at を持つ点: 時計が at より前なら at まで進める（通過した events を発火）。
// - events: 時計が at を通過した時、when を満たせば一度だけ発火（state.flags[`ev:${id}`]=true で記録）。
// - 声の trigger: point=判断表示時に points[].voices のうち該当を発火 / after=直前の選択後（choice 指定があれば一致時のみ）
//   / flags=条件が真になった時に一度 / manual=臆病・遅延など他から呼ばれる。
// - 期限: dueAt = start + references[ref].deadlineHours。doneFlag が立てば done。
//   残り12時間未満で warned + se:deadline_warn + fx:deadline、過ぎたら over + points 加算 + se:deadline_over。
// - 条件の flags: 未設定の旗は false とみなす。
// - 時計: minutes が 1440 以上になったら day を繰り上げる。
// - エンディング計算前に: 未適用の遅れて来る効果を全部適用し、done でない期限は over として points を加算。
// - 深夜帯 22:00〜6:00 は stamina の減少を 1.5倍（切り捨て）、fx:night on/off。

export type Lang = 'ja' | 'en';
export const LANGS: readonly Lang[] = ['ja', 'en'];
export type Localized = Record<Lang, string>;

export type RoleId = 'executive' | 'officer' | 'lead' | 'analyst';
export const ROLES: readonly RoleId[] = ['executive', 'officer', 'lead', 'analyst'];

export type PhaseId = 'detect' | 'contain' | 'organize' | 'investigate' | 'notify' | 'recover' | 'after';
export const PHASES: readonly PhaseId[] = ['detect', 'contain', 'organize', 'investigate', 'notify', 'recover', 'after'];

export type Category = 'increase' | 'recover' | 'maintain' | 'hurt' | 'fatal';
export const CATEGORY_RANGE: Record<Category, readonly [number, number]> = {
  increase: [200, 500],
  recover: [50, 150],
  maintain: [10, 30],
  hurt: [-150, -30],
  fatal: [-300, -200],
};

export type Axis = 'time' | 'order' | 'wording' | 'content' | 'record' | 'care';
export type Media = 'sns' | 'news' | 'board' | 'chat' | 'boss' | 'vendor' | 'attacker';
export type Rank = 'S' | 'A' | 'B' | 'C' | 'D';

/** Day と 0:00 からの分（15の倍数） */
export interface GameTime { day: number; minutes: number }
export interface Gauges { damage: number; flame: number; trust: number; stamina: number }
export type GaugeDelta = Partial<Gauges>;
export type Flags = Record<string, boolean>;

/** 条件。すべて満たすと真 */
export interface Condition { flags?: Flags }

// ---------------- シナリオ（YAML → JSON 後も同じ形） ----------------

export interface Scenario {
  id: string;
  version: string;
  status: 'latest' | 'standard' | 'retired';
  published: string;
  sourcePeriod: Localized;
  difficulty: 1 | 2 | 3 | 4 | 5;
  languages: Lang[];
  referencesVersion: string;
  legalPack: string;
  title: Localized;
  tagline: Localized;
  company: {
    name: Localized;
    industry: Localized;
    size: Localized;
    people: { id: string; name: Localized; title: Localized }[];
  };
  start: GameTime;
  initialGauges: Gauges;
  audio: { bgmDefault: string; bgmByPhase?: Partial<Record<PhaseId, string>> };
  roles: Partial<Record<RoleId, RoleScript>>;
  press?: Press;
  endings: Record<Rank, { text: Localized; bgm: string }>;
  salesModel: { base: number; trustWeight: number; fatalPenalty: number; min: number; max: number };
  illustrations?: Illustration[];
}

export interface RoleScript {
  estimateMinutes: number;
  intro: Localized;
  points: DecisionPoint[];
  drafts?: Record<string, Draft>;
  voices: Voice[];
  events?: ScenarioEvent[];
  /** 臆病ゲージ: cowardStreak が 2,3,4以上 になったとき発火する声ID */
  cowardVoices: { '2': string; '3': string; '4': string };
  /** 法定期限。時間は references の deadlineHours を使う（C15） */
  deadlines?: { id: string; ref: string; label: Localized; points: number; doneFlag: string }[];
  /** 判断ポイントを使い切った後に記者会見をするか */
  pressEnabled: boolean;
}

export interface DecisionPoint {
  id: string;
  at?: GameTime;
  when?: Condition;
  phase: PhaseId;
  text: Localized;
  illustration?: string;
  sound?: { se?: string[] };
  voices?: string[];
  popular?: { choiceId: string; percent: number };
  /** プレイヤーが記録に残せる事実 */
  notable?: { id: string; text: Localized }[];
  choices: Choice[];
}

export interface DetailItem {
  id: string;
  points: number; // ±1〜20（C04）
  axis: Axis;
  refs: string[];
}

export interface Choice {
  id: string;
  text: Localized;
  minutes: number; // 15の倍数
  category: Category;
  points: number;
  refs: string[];
  gauges?: GaugeDelta;
  coward?: boolean;
  setFlags?: Flags;
  delayed?: DelayedSpec[];
  detail?: string; // drafts のキー
  fatalAlternate?: number;
  /** 選ぶと取れる細目 */
  items?: DetailItem[];
}

export interface DelayedSpec {
  afterPhases: number;
  points?: number;
  gauges?: GaugeDelta;
  reason: Localized;
}

export interface Draft {
  title: Localized;
  slots: DraftSlot[];
}

export interface DraftSlot {
  id: string;
  label: Localized;
  /** true: 時計から自動で決まる（items を when で判定） */
  auto?: boolean;
  items?: (DetailItem & { when: { withinHours?: number; otherwise?: boolean } })[];
  options?: (DetailItem & { text: Localized; delayed?: DelayedSpec })[];
}

export interface Voice {
  id: string;
  media: Media;
  misleading: boolean; // 振り返り専用
  type?: MisleadingType; // 振り返り専用（misleading: true のとき必須）
  text: Localized;
  trigger: { at: 'point' } | { at: 'after'; choice?: string } | { flags: Flags } | { at: 'manual' };
}

export interface ScenarioEvent {
  id: string;
  at: GameTime;
  when?: Condition;
  voices?: string[];
  gauges?: GaugeDelta;
  setFlags?: Flags;
  sound?: { se?: string[] };
  caption?: Localized;
}

/** when: 旗の条件を満たす時だけ出す回答（例: 身代金を払った時だけ「支払った」と答えられる） */
export interface PressAnswer { id: string; text: Localized; points: number; requiresNote?: string | false; when?: Condition }
export interface PressQuestion { id: string; text: Localized; seconds?: number; answers: PressAnswer[]; timeoutPoints?: number }
export interface Press {
  questions: PressQuestion[];
  extraQuestions?: { when: Condition; question: PressQuestion }[];
}

export interface Illustration { id: string; file: string; alt: Localized; credit: Localized }

export interface Reference {
  id: string;
  title: Localized;
  issuer: Localized;
  version: string;
  section: Localized;
  summary: Localized;
  url?: string;
  checkedAt: string;
  legalPack: string;
  /** 法定期限の時間（C15）。期限を持つ根拠だけ */
  deadlineHours?: number;
}

/** シナリオ選択用の要約（src/data/index.json） */
export interface ScenarioSummary {
  id: string;
  version: string;
  status: Scenario['status'];
  title: Localized;
  tagline: Localized;
  sourcePeriod: Localized;
  difficulty: number;
  roles: { role: RoleId; estimateMinutes: number }[];
}

// ---------------- プレイの状態 ----------------

export interface ChoiceRecord {
  pointId: string;
  choiceId: string;
  at: GameTime;
  policyPoints: number;
  itemPoints: number;
  voicesBefore: string[];
}

export interface DelayedEffect {
  sourcePointId: string;
  sourceChoiceId: string;
  dueAtPhaseIndex: number;
  points: number;
  gauges?: GaugeDelta;
  reason: Localized;
  applied: boolean;
}

export interface VoiceShown { voiceId: string; at: GameTime; pointId: string | null }
export interface PlayerNote { id: string; text: Localized | string; at: GameTime }
export interface DeadlineState { id: string; dueAt: GameTime; warned: boolean; done: boolean; over: boolean }
export interface PressState { questionIds: string[]; index: number; answers: { questionId: string; answerId: string | null; points: number }[] }

export interface PlayState {
  scenarioId: string;
  scenarioVersion: string;
  role: RoleId;
  playCount: number;
  clock: GameTime;
  phase: PhaseId;
  pointId: string | null;
  gauges: Gauges;
  cowardStreak: number;
  rawScore: number;
  fatal: boolean;
  history: ChoiceRecord[];
  itemsEarned: string[];
  itemsMissed: string[];
  delayed: DelayedEffect[];
  voicesShown: VoiceShown[];
  notes: PlayerNote[];
  deadlines: DeadlineState[];
  flags: Flags;
  press: PressState | null;
  prologue: { comment: string; predictedHours: number | null };
  startedAt: string;
  /** 文案作成待ちの draft キー */
  pendingDraft: string | null;
  finished: boolean;
}

// ---------------- 演出キュー（正誤情報を入れない: 10章） ----------------

export type FxId = 'avalanche' | 'shake' | 'night' | 'fastforward' | 'deadline' | 'flash' | 'blur' | 'stamp';

export type Cue =
  | { kind: 'bgm'; id: string }
  | { kind: 'se'; id: string }
  | { kind: 'fx'; id: FxId; on?: boolean }
  | { kind: 'voice'; voiceId: string; media: Media }
  | { kind: 'caption'; text: Localized }
  | { kind: 'delayedHit'; reason: Localized }
  | { kind: 'clock'; from: GameTime; to: GameTime };

export type Next = 'point' | 'draft' | 'press' | 'ending';

export interface StepResult {
  state: PlayState;
  cues: Cue[];
  next: Next;
}

// ---------------- 結果 ----------------

export interface EndingResult {
  raw: number;
  multiplier: number;
  official: number;
  rank: Rank;
  sales: number;
  fatal: boolean;
  playCount: number;
}

export interface ReportEntry {
  pointId: string;
  choiceId: string;
  at: GameTime;
  policyPoints: number;
  itemPoints: number;
  refs: string[];
  movedBy: { voiceId: string; misleading: boolean; type?: string }[];
  delayedHits: { reason: Localized; points: number }[];
}

export interface Report {
  playCount: number;
  result: EndingResult;
  entries: ReportEntry[];
  itemsEarned: { id: string; points: number; axis: Axis; refs: string[] }[];
  itemsMissed: { id: string; points: number; axis: Axis; refs: string[] }[];
  pressAnswers: PressState['answers'];
}

// ---------------- エンジン公開API（src/engine/index.ts が実装して再export） ----------------
// export function startPlay(scenario: Scenario, role: RoleId, playCount: number, prologue: PlayState['prologue'], startedAt: string, refs: Reference[]): StepResult
// export function choose(state: PlayState, scenario: Scenario, choiceId: string): StepResult
// export function submitDraft(state: PlayState, scenario: Scenario, selections: Record<string, string>): StepResult
// export function startPress(state: PlayState, scenario: Scenario): StepResult
// export function answerPress(state: PlayState, scenario: Scenario, answerId: string | null, multiplierSeconds?: number): StepResult
// export function addNote(state: PlayState, note: PlayerNote): PlayState
// export function currentPoint(state: PlayState, scenario: Scenario): DecisionPoint | null
// export function availableAnswers(state: PlayState, scenario: Scenario): PressAnswer[]
// export function computeResult(state: PlayState, scenario: Scenario): EndingResult
// export function buildReport(state: PlayState, scenario: Scenario): Report
// export function multiplierFor(playCount: number): number
// export function rankFor(official: number, fatal: boolean): Rank
// 引数の state は変更しない（structuredClone して新しい state を返す）。乱数・Date.now 禁止。

// ---------------- 設定・保存 ----------------

export interface Settings {
  lang: Lang;
  fontSize: 'small' | 'medium' | 'large';
  bgmVolume: number; // 0〜1, 既定0.5
  seVolume: number;  // 0〜1, 既定0.7
  muted: boolean;
  reduceMotion: boolean;
  pressTimeScale: 1 | 1.5 | 2;
  soundNoticeShown: boolean;
}

export interface PlayRecord {
  count: number;
  first: { rank: Rank; score: number; raw: number; at: string } | null;
  best: { rank: Rank; score: number; count: number } | null;
}
export type PlaysStore = Record<string, PlayRecord>; // key: `${scenarioId}/${role}`

export const STORAGE_KEYS = {
  settings: 'ytcdb:v1:settings',
  plays: 'ytcdb:v1:plays',
  progress: 'ytcdb:v1:progress',
  prologue: 'ytcdb:v1:prologue',
} as const;

// ---------------- 音素材 ----------------

export interface AudioAsset {
  id: string;
  kind: 'bgm' | 'se' | 'ambience';
  file: string;
  loop: boolean;
  title: string;
  author: string;
  site: string;
  url: string;
  termsUrl: string;
  termsCheckedAt: string;
  conditions: {
    game: boolean; free: boolean; modify: boolean; creditRequired: boolean;
    creditText: string; themeOk: boolean; redistribution: string;
  };
  notes?: string;
}

// ---------------- 生成データの場所（tools/build-data が書き出す） ----------------
// src/data/index.json        ScenarioSummary[]
// src/data/scenarios/<id>.json Scenario
// src/data/references.json   Reference[]
// src/data/locales.json      Record<Lang, { strings: Record<string,string>; notices: Record<NoticeId,string> }>
// src/data/audio.json        AudioAsset[]
export type NoticeId = 'criminal' | 'fiction' | 'score' | 'purpose' | 'voices' | 'replay';

// ---------------- 定数（scoring・gauges が使う） ----------------
export const PLAY_MULTIPLIER = [1.2, 1.0, 0.8, 0.6] as const; // 1,2,3,4回目以降
export const RANK_THRESHOLDS = { S: 1200, A: 600, B: 200, C: 0 } as const;
export const COWARD_PENALTY = { 2: -10, 3: -20, 4: -40 } as const; // 4以上は毎回 -40
export const FLAME_BGM = { up: [40, 70], down: [35, 65] } as const;
export const NIGHT = { start: 22 * 60, end: 6 * 60, staminaFactor: 1.5 } as const;
export const DEADLINE_WARN_MINUTES = 12 * 60;
export const STAMINA_BLUR = 20;
export const AVALANCHE_FLAME_JUMP = 15;
export const MISLEADING_TYPES = [
  'public-opinion',   // 世論
  'coward-critique',  // 臆病批判
  'fake-expert',      // 自称専門家
  'well-meant-field', // 善意の現場
  'boss-pressure',    // 上司の圧力
  'law-ish',          // それっぽい法律
  'vendor-interest',  // ベンダーの都合
  'attacker-shake',   // 攻撃者の揺さぶり
  'fake-insider',     // 偽の内部告発
  'bold-buzz',        // 強気でウケる
  'past-success',     // 前回の成功体験
  'flattery',         // 褒め言葉
  'popular',          // みんなもそうしてる
] as const;
export type MisleadingType = (typeof MISLEADING_TYPES)[number];
export const BGM_IDS = ['title', 'prologue', 'calm', 'tension_low', 'tension_mid', 'tension_high', 'night', 'press',
  'ending_s', 'ending_a', 'ending_b', 'ending_c', 'ending_d'] as const;
export const SE_IDS = ['notify_sns', 'notify_news', 'notify_chat', 'phone_ring', 'mail_arrive', 'clock_tick',
  'deadline_warn', 'deadline_over', 'typing', 'shutter', 'press_timer', 'select', 'confirm', 'delayed_hit', 'stamp'] as const;
export const MEDIA_SE: Record<Media, string> = {
  sns: 'notify_sns', news: 'notify_news', board: 'notify_sns', chat: 'notify_chat',
  boss: 'phone_ring', vendor: 'mail_arrive', attacker: 'mail_arrive',
};
