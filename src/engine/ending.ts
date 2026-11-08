// エンディング判定（設計書 6.6・6.7・5.7）
import { computeResult, salesForecast } from "./scoring";
import type { EndingResult, Localized, PlayState, Scenario } from "./types";

export interface EndingView {
  result: EndingResult;
  text: Localized;
  bgm: string;
}

/** ランクに対応するエンディングの文章とBGMを返す */
export function endingFor(state: PlayState, scenario: Scenario): EndingView {
  const result = computeResult(state, scenario);
  const ending = scenario.endings[result.rank];
  return { result, text: ending.text, bgm: ending.bgm };
}

export { salesForecast };
