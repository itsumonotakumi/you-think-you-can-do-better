// ランキング関連の文言キー（#7）。locales/*/ui/ranking.yaml の rk.* を指す。
// 画面側に文字列を散らかさないため、ここにまとめる。
export const RANKING_KEYS = {
  /** タイトル画面の導線 */
  introLink: 'rk.intro.link',
  /** エンディング画面のランキング導線 */
  endingJoin: 'rk.ending.join',
  /** 振り返りの「この判断で◯%がこれを選んだ」 */
  reviewLine: 'rk.review.line',
  /** 本名・個人情報を入れない注意書き（プレイ前とランキング画面で使う） */
  nicknameWarning: 'rk.nickname.warning',
  /** 終了時に自動で登録されることの説明 */
  autoNotice: 'rk.nickname.autoNotice',
  /** 以後の自動登録を止める設定 */
  optOutLabel: 'rk.optout.label',
} as const;
