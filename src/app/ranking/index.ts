// ランキングの入口（#7）。画面はここからだけ使う。
export { apiBase, apiUrl, isRankingEnabled, normalizeApiBase, resolveApiBase, turnstileSiteKey } from './config';
export { fetchChoiceStats, fetchRanking, submitPlay } from './api';
export type { RankingQuery, RequestOptions, Fetcher } from './api';
export {
  NICKNAME_MAX, createClientId, ensureRankingProfile, isValidNickname, loadRankingProfile,
  normalizeNickname, saveRankingProfile,
} from './profile';
export type { RankingProfile, RankingStore } from './profile';
export {
  buildRankingSubmission, canSubmitRanking, collectChoices, collectDraftChoices, collectPress,
  submissionInput,
} from './submission';
export { choicePercent } from './stats';
export { loadTurnstile, mountTurnstile } from './turnstile';
export { RANKING_KEYS } from './i18n';
