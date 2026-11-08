// 使い方: node --experimental-strip-types tools/validate/index.ts
import process from 'node:process';
import { validateProject } from './checks.ts';

const result = validateProject({ root: process.cwd() });

for (const warning of result.warnings) {
  console.log(`${warning.file}:${warning.line}: [${warning.code}] ${warning.message}`);
}
for (const error of result.errors) {
  console.error(`${error.file}:${error.line}: [${error.code}] ${error.message}`);
}

if (result.errors.length > 0) {
  console.error(`validate: ${result.errors.length} 件のエラー`);
  process.exitCode = 1;
} else {
  console.log(`validate: OK（警告 ${result.warnings.length} 件）`);
}
