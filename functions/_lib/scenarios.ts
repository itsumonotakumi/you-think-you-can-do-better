// build-data が書き出したシナリオ JSON を読む（サーバー側の点数計算用）。
// 一覧は JSON の id から作るので、ここに id を手書きしない。
// Pages Functions は esbuild で束ねるため import.meta.glob は使えない。新しいシナリオを足すときは
// 下の import を 1 行足す（足し忘れは tests/unit/fix-rank-api/scenarios.test.ts が検出する）。
import type { Reference, Scenario } from '../../src/engine/types';
import no01 from '../../src/data/scenarios/no01-nebula.json';
import no02 from '../../src/data/scenarios/no02-paybridge.json';
import no03 from '../../src/data/scenarios/no03-yamabiko.json';
import no04 from '../../src/data/scenarios/no04-goride.json';
import no05 from '../../src/data/scenarios/no05-kogane.json';
import no06 from '../../src/data/scenarios/no06-amatsu.json';
import no07 from '../../src/data/scenarios/no07-connectcall.json';
import no08 from '../../src/data/scenarios/no08-kaname.json';
import no09 from '../../src/data/scenarios/no09-hamakaze.json';
import no10 from '../../src/data/scenarios/no10-nexus.json';
import no11 from '../../src/data/scenarios/no11-hinata.json';
import no12 from '../../src/data/scenarios/no12-sorano.json';
import no13 from '../../src/data/scenarios/no13-tsumugi.json';
import no14 from '../../src/data/scenarios/no14-poppo.json';
import no15 from '../../src/data/scenarios/no15-kotonoha.json';
import no16 from '../../src/data/scenarios/no16-hajime.json';
import references from '../../src/data/references.json';

const ALL = [
  no01, no02, no03, no04, no05, no06, no07, no08,
  no09, no10, no11, no12, no13, no14, no15, no16,
] as unknown as Scenario[];

export const SCENARIOS: ReadonlyMap<string, Scenario> = new Map(
  ALL.map((scenario) => [scenario.id, scenario]),
);

export const REFERENCES = references as unknown as Reference[];

export function findScenario(id: string): Scenario | null {
  return SCENARIOS.get(id) ?? null;
}
