// ランキングの入口（#7）。画面はここからだけ使う。
export { apiBase, apiUrl, isRankingEnabled, normalizeApiBase, resolveApiBase, turnstileSiteKey } from './config';
export { deletePlays, fetchChoiceStats, fetchRanking, submitPlay } from './api';
export type { DeletePlaysInput, DeletePlaysResult, RankingQuery, RequestOptions, Fetcher } from './api';
export {
  EMPTY_RANKING_PROFILE, NICKNAME_MAX, createClientId, ensureRankingProfile, isValidNickname,
  loadRankingProfile, normalizeNickname, rankingStore, saveRankingProfile,
} from './profile';
export type { RankingProfile, RankingStore } from './profile';
export {
  DELETE_KEY_BYTES, DELETE_KEY_RE, DELETE_KEY_STORAGE, createDeleteKey, ensureDeleteKey,
  isValidDeleteKey, loadDeleteKey, saveDeleteKey,
} from './delete-key';
export {
  buildRankingSubmission, canSubmitRanking, collectChoices, collectDraftChoices, collectPress,
  submissionInput,
} from './submission';
export type { RankingPlaySubmission, SubmissionInput } from './submission';
export { choicePercent } from './stats';
export { loadTurnstile, mountTurnstile } from './turnstile';
export { RANKING_KEYS } from './i18n';
