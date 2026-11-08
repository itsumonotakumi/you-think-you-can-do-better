// 使い方: node --experimental-strip-types tools/build-data/index.ts
import process from 'node:process';
import { buildData } from './build.ts';

try {
  const result = buildData({ root: process.cwd() });
  console.log(`build-data: ${result.written.length} ファイル（シナリオ ${result.scenarios.length} 本）`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
