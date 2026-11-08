// 共有フィクスチャ（オーケストレーター所有。編集禁止）。engine・画面の単体テストはこれを使う。
import type { Scenario, Reference } from '../../src/engine/types';

const L = (ja: string) => ({ ja, en: `EN:${ja}` });

export const fixtureRefs: Reference[] = [
  { id: 'ref-a', title: L('根拠A'), issuer: L('発行者'), version: '2026-11', section: L('節'), summary: L('要約'),
    checkedAt: '2026-11-08', legalPack: 'jp' },
  { id: 'ref-prelim', title: L('速報'), issuer: L('個人情報保護委員会'), version: '2026-11', section: L('3〜5日'),
    summary: L('早く出す'), checkedAt: '2026-11-08', legalPack: 'jp', deadlineHours: 72 },
];

export const fixture: Scenario = {
  id: 'fixture',
  version: '1.0.0',
  status: 'standard',
  published: '2026-11-08',
  sourcePeriod: L('テスト'),
  difficulty: 1,
  languages: ['ja', 'en'],
  referencesVersion: '2026-11-08',
  legalPack: 'jp',
  title: L('テスト社'),
  tagline: L('テスト'),
  company: { name: L('テスト株式会社'), industry: L('IT'), size: L('10名'), people: [] },
  start: { day: 0, minutes: 540 }, // Day0 9:00
  initialGauges: { damage: 20, flame: 0, trust: 70, stamina: 100 },
  audio: { bgmDefault: 'tension_low', bgmByPhase: { notify: 'tension_mid' } },
  roles: {
    executive: {
      estimateMinutes: 5,
      intro: L('導入'),
      pressEnabled: true,
      cowardVoices: { '2': 'v-c2', '3': 'v-c3', '4': 'v-c4' },
      deadlines: [{ id: 'dl-prelim', ref: 'ref-prelim', label: L('速報'), points: -50, doneFlag: 'reported' }],
      events: [{ id: 'ev-news', at: { day: 0, minutes: 720 }, voices: ['v-news'], gauges: { flame: 10 } }],
      voices: [
        { id: 'v-p1-mis', media: 'sns', misleading: true, type: 'boss-pressure', text: L('黙っておけ'), trigger: { at: 'point' } },
        { id: 'v-p1-ok', media: 'chat', misleading: false, text: L('まず止めて'), trigger: { at: 'point' } },
        { id: 'v-p1-after', media: 'sns', misleading: false, text: L('大げさだ'), trigger: { at: 'after', choice: 'isolate' } },
        { id: 'v-news', media: 'news', misleading: false, text: L('報道'), trigger: { at: 'manual' } },
        { id: 'v-c2', media: 'sns', misleading: false, text: L('いつまで調査中'), trigger: { at: 'manual' } },
        { id: 'v-c3', media: 'sns', misleading: false, text: L('事なかれ'), trigger: { at: 'manual' } },
        { id: 'v-c4', media: 'news', misleading: false, text: L('臆病な経営'), trigger: { at: 'manual' } },
      ],
      points: [
        {
          id: 'p1', phase: 'detect', text: L('不審な通信'), voices: ['v-p1-mis', 'v-p1-ok'],
          notable: [{ id: 'note-warning', text: L('事前に警告があった') }],
          choices: [
            { id: 'isolate', text: L('隔離'), minutes: 60, category: 'recover', points: 100, refs: ['ref-a'],
              gauges: { damage: -10, stamina: -10 }, setFlags: { contained: true },
              items: [{ id: 'i-iso-record', points: 5, axis: 'record', refs: ['ref-a'] }] },
            { id: 'wait', text: L('様子見'), minutes: 120, category: 'hurt', points: -50, refs: ['ref-a'],
              gauges: { damage: 20, stamina: -5 }, coward: true,
              delayed: [{ afterPhases: 1, points: -30, gauges: { trust: -10 }, reason: L('被害が拡大') }] },
            { id: 'wipe', text: L('全部初期化'), minutes: 180, category: 'fatal', points: -250, refs: ['ref-a'],
              gauges: { damage: 10, stamina: -20 } },
          ],
        },
        {
          id: 'p2', phase: 'detect', text: L('上司が黙れと言う'),
          choices: [
            { id: 'hold', text: L('保留'), minutes: 60, category: 'hurt', points: -30, refs: ['ref-a'], coward: true,
              gauges: { flame: 20 } },
            { id: 'escalate', text: L('報告'), minutes: 30, category: 'maintain', points: 20, refs: ['ref-a'] },
          ],
        },
        {
          id: 'p3', phase: 'notify', at: { day: 0, minutes: 1080 }, text: L('第1報'),
          choices: [
            { id: 'publish', text: L('今夜出す'), minutes: 120, category: 'increase', points: 300, refs: ['ref-prelim'],
              fatalAlternate: 5, setFlags: { reported: true }, detail: 'draft1', gauges: { trust: 5, stamina: -10 } },
            { id: 'delay', text: L('確定まで待つ'), minutes: 60, category: 'hurt', points: -100, refs: ['ref-prelim'],
              coward: true, gauges: { trust: -10 } },
          ],
        },
        {
          id: 'p4', phase: 'recover', when: { flags: { contained: true } }, text: L('再開判断'),
          choices: [
            { id: 'resume-safe', text: L('確認後に再開'), minutes: 240, category: 'maintain', points: 30, refs: ['ref-a'] },
          ],
        },
      ],
      drafts: {
        draft1: {
          title: L('第1報の文案'),
          slots: [
            { id: 'timing', label: L('時刻'), auto: true, items: [
              { id: 't-24h', when: { withinHours: 24 }, points: 10, axis: 'time', refs: ['ref-prelim'] },
              { id: 't-late', when: { otherwise: true }, points: -15, axis: 'time', refs: ['ref-prelim'] },
            ] },
            { id: 'scope', label: L('範囲'), options: [
              { id: 's-all', text: L('全員'), points: 10, axis: 'content', refs: ['ref-a'] },
              { id: 's-current', text: L('現会員のみ'), points: -20, axis: 'content', refs: ['ref-a'],
                delayed: { afterPhases: 1, points: -20, reason: L('訂正が必要') } },
            ] },
          ],
        },
      },
    },
  },
  press: {
    questions: [
      { id: 'q1', text: L('事前に指摘は'), seconds: 30, timeoutPoints: -30, answers: [
        { id: 'a1', text: L('調査中'), points: 30 },
        { id: 'a2', text: L('ありました'), points: 80, requiresNote: 'note-warning' },
        { id: 'a3', text: L('ない'), points: -100 },
      ] },
    ],
    extraQuestions: [{ when: { flags: { contained: false } }, question:
      { id: 'qx', text: L('なぜ止めなかった'), answers: [{ id: 'ax1', text: L('判断の誤り'), points: 20 }] } }],
  },
  endings: {
    S: { text: L('S'), bgm: 'ending_s' }, A: { text: L('A'), bgm: 'ending_a' }, B: { text: L('B'), bgm: 'ending_b' },
    C: { text: L('C'), bgm: 'ending_c' }, D: { text: L('D'), bgm: 'ending_d' },
  },
  salesModel: { base: 100, trustWeight: 0.4, fatalPenalty: 10, min: 40, max: 130 },
};
