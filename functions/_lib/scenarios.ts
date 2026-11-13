// build-data が書き出したシナリオ JSON を読む（サーバー側の点数計算用）
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
import references from '../../src/data/references.json';

const ALL = [no01, no02, no03, no04, no05, no06, no07, no08, no09, no10] as unknown as Scenario[];

export const SCENARIOS: ReadonlyMap<string, Scenario> = new Map(ALL.map((sc) => [sc.id, sc]));

export const REFERENCES = references as unknown as Reference[];

export function findScenario(id: string): Scenario | null {
  return SCENARIOS.get(id) ?? null;
}
