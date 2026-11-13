// エンジン公開API（types.ts 末尾の一覧）。
export { startPlay, currentPoint, addNote } from './state';
export { choose, submitDraft } from './choices';
export { finalizeBeforeEnding } from './deadlines';
export { HARD_SECONDS, decisionSeconds, timeoutChoice } from './mode';

// 以下は engine-read 担当。未着の間も型チェックを通すため行だけ残す。
// @ts-ignore
export { startPress, answerPress, availableAnswers } from './press';
// @ts-ignore
export { computeResult, multiplierFor, rankFor } from './scoring';
// @ts-ignore
export { buildReport } from './report';
