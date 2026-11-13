// 称号の定義（#9）。条件の判定は evaluate.ts、保存は storage.ts。
import type { Achievement, Localized } from '../../engine/types';

export type AchievementScope = 'play' | 'total';

export interface AchievementDef extends Achievement {
  /** play: 1回のプレイで決まる / total: プレイ記録の積み重ねで決まる */
  scope: AchievementScope;
  /** 未獲得のときに出す、条件をぼかしたヒント（数字や細かい条件は書かない） */
  hint: Localized;
  /** 代表の称号を選ぶときの重み。大きいほど珍しい */
  weight: number;
}

/** タイトル画面の「称号一覧」ボタンの文言キー（locales の ui/achievements.yaml） */
export const ACHIEVEMENTS_LABEL_KEY = 'ach.open';

const L = (ja: string, en: string): Localized => ({ ja, en });

/** 表示順。1回のプレイで決まるものを先に、積み重ねのものを後ろに置く */
export const ACHIEVEMENTS: readonly AchievementDef[] = [
  {
    id: 'first-clear',
    scope: 'play',
    weight: 1,
    title: L('はじめての当事者', 'First Time in the Hot Seat'),
    description: L('はじめてエンディングまで到達した。', 'Reached an ending for the first time.'),
    hint: L('最後までプレイする。', 'Play through to the end.'),
  },
  {
    id: 'flame-zero',
    scope: 'play',
    weight: 7,
    title: L('鎮火の達人', 'Firefighter'),
    description: L('炎上度を0のまま終えた。', 'Finished with the flame gauge at zero.'),
    hint: L('炎上を一度も起こさずに終える。', 'Finish without ever setting the public on fire.'),
  },
  {
    id: 'fast-report',
    scope: 'play',
    weight: 7,
    title: L('初報は72時間以内', 'First Word Within 72 Hours'),
    description: L('通知・公表の判断を72時間以内に終えた。', 'Finished the first disclosure decision within 72 hours.'),
    hint: L('速報を早めに出す。', 'Get the first word out quickly.'),
  },
  {
    id: 'press-no-timeout',
    scope: 'play',
    weight: 6,
    title: L('会見で詰まらない', 'Never Stuck at the Podium'),
    description: L('記者会見で一度も時間切れにならなかった。', 'Never ran out of time at the press conference.'),
    hint: L('会見の質問にすべて答える。', 'Answer every question at the press conference.'),
  },
  {
    id: 'coward-zero',
    scope: 'play',
    weight: 5,
    title: L('臆病ゲージ0', 'Zero Cowardice'),
    description: L('臆病ゲージを0のまま終えた。', 'Finished with the cowardice gauge at zero.'),
    hint: L('保身に走らずに終える。', 'Finish without playing it safe.'),
  },
  {
    id: 'no-fatal',
    scope: 'play',
    weight: 2,
    title: L('致命傷なし', 'No Fatal Wound'),
    description: L('致命的な失敗をせずに終えた。', 'Finished without a fatal mistake.'),
    hint: L('取り返しのつかない失敗を避ける。', 'Avoid the mistake you cannot undo.'),
  },
  {
    id: 'rank-s',
    scope: 'play',
    weight: 8,
    title: L('S級の対応', 'S-Rank Response'),
    description: L('ランクSを獲得した。', 'Earned rank S.'),
    hint: L('最高ランクに届く。', 'Reach the top rank.'),
  },
  {
    id: 'hard-a',
    scope: 'play',
    weight: 8,
    title: L('本番モードでA以上', 'A or Better on Hard'),
    description: L('本番モードでランクA以上を獲得した。', 'Earned rank A or better in hard mode.'),
    hint: L('難しい設定で高得点を出す。', 'Score high under the harder setting.'),
  },
  {
    id: 'items-complete',
    scope: 'play',
    weight: 5,
    title: L('抜け目のない記録', 'Nothing Missed'),
    description: L('取れる細目を1つも落とさずに終えた。', 'Finished without missing a single available detail.'),
    hint: L('細目を取りこぼさずに終える。', 'Finish without dropping any detail.'),
  },
  {
    id: 'deadline-all',
    scope: 'play',
    weight: 6,
    title: L('期限厳守', 'Deadline Keeper'),
    description: L('法定期限をすべて守った。', 'Met every legal deadline.'),
    hint: L('期限を過ぎずに終える。', 'Finish without passing a deadline.'),
  },
  {
    id: 'notes-3',
    scope: 'play',
    weight: 3,
    title: L('現場の記録者', 'Field Note-Taker'),
    description: L('記録を3件以上書いた。', 'Wrote three or more notes.'),
    hint: L('記録を何件か書く。', 'Write a few notes.'),
  },
  {
    id: 'prediction-hit',
    scope: 'play',
    weight: 5,
    title: L('読みの鋭さ', 'Sharp Read'),
    description: L('プロローグの公表時間の予想が、実際と3時間以内に収まった。', 'Your predicted disclosure time landed within three hours of the actual one.'),
    hint: L('最初の予想を当てる。', 'Get your first prediction right.'),
  },
  {
    id: 'long-haul',
    scope: 'play',
    weight: 3,
    title: L('長期戦の司令塔', 'Long Haul Commander'),
    description: L('2日以上かけて収束させた。', 'Brought the incident to a close over two days or more.'),
    hint: L('長引く事件を終わらせる。', 'See a drawn-out incident through to the end.'),
  },
  {
    id: 'trust-70',
    scope: 'play',
    weight: 4,
    title: L('信頼を守った', 'Trust Kept'),
    description: L('信頼を70以上で終えた。', 'Finished with trust at 70 or above.'),
    hint: L('信頼を高く保って終える。', 'Finish with trust held high.'),
  },
  {
    id: 'damage-low',
    scope: 'play',
    weight: 4,
    title: L('被害を最小限に', 'Damage Contained'),
    description: L('被害拡大を20以下で終えた。', 'Finished with damage at 20 or below.'),
    hint: L('被害を小さく抑えて終える。', 'Finish with the damage held small.'),
  },
  {
    id: 'all-roles',
    scope: 'total',
    weight: 7,
    title: L('四つの立場', 'All Four Seats'),
    description: L('1つのシナリオを全4ロールでプレイした。', 'Played one scenario in all four roles.'),
    hint: L('同じ事件を別の立場でもプレイする。', 'Play the same incident from another seat.'),
  },
  {
    id: 'scenarios-3',
    scope: 'total',
    weight: 4,
    title: L('渡り歩く対応者', 'Itinerant Responder'),
    description: L('3つ以上のシナリオをプレイした。', 'Played three or more scenarios.'),
    hint: L('複数の事件を経験する。', 'Experience more than one incident.'),
  },
  {
    id: 'rank-s-two',
    scope: 'total',
    weight: 6,
    title: L('Sの常連', 'Twice S'),
    description: L('2つ以上のシナリオでランクSを獲得した。', 'Earned rank S in two or more scenarios.'),
    hint: L('別の事件でも最高ランクを取る。', 'Take the top rank in another incident too.'),
  },
  {
    id: 'plays-10',
    scope: 'total',
    weight: 5,
    title: L('常連', 'Regular'),
    description: L('通算10回プレイした。', 'Played ten times in total.'),
    hint: L('何度もプレイする。', 'Keep playing.'),
  },
  {
    id: 'plays-20',
    scope: 'total',
    weight: 6,
    title: L('ベテラン対応者', 'Veteran Responder'),
    description: L('通算20回プレイした。', 'Played twenty times in total.'),
    hint: L('さらに回数を重ねる。', 'Keep adding to the count.'),
  },
  {
    id: 'all-scenarios',
    scope: 'total',
    weight: 9,
    title: L('全シナリオ制覇', 'Every Scenario'),
    description: L('公開中のすべてのシナリオをプレイした。', 'Played every published scenario.'),
    hint: L('すべての事件を経験する。', 'Experience every incident.'),
  },
  {
    // 要件（requirements-ja.md）の全クリア後の称号
    id: 'graduate',
    scope: 'total',
    weight: 10,
    title: L('外野卒業', 'No Longer an Onlooker'),
    description: L('公開中のすべてのシナリオを、全4ロールでプレイした。', 'Played every published scenario in all four roles.'),
    hint: L('すべての事件を、すべての立場で経験する。', 'Experience every incident from every seat.'),
  },
];

const BY_ID = new Map(ACHIEVEMENTS.map((def) => [def.id, def]));

/** id から定義を引く。知らない id は null */
export function achievementById(id: string): AchievementDef | null {
  return BY_ID.get(id) ?? null;
}

/** 定義にある id か（保存データの掃除に使う） */
export function isKnownAchievement(id: string): boolean {
  return BY_ID.has(id);
}
