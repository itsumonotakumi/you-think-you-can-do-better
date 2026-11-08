// 使い方: node --experimental-strip-types tools/validate/index.ts
import process from 'node:process';
import { validateProject } from './checks.ts';
import type { ValidationResult } from './checks.ts';

function firstLine(message: string): string {
  return message.split('\n')[0] ?? message;
}

function main(): void {
  let result: ValidationResult;
  try {
    result = validateProject({ root: process.cwd() });
  } catch (error) {
    // 読めないファイルなどで例外が出ても、設計どおり「ファイル: [C17] 理由」で落とす
    const file = (error as { file?: unknown }).file;
    const message = firstLine(error instanceof Error ? error.message : String(error));
    console.error(`${typeof file === 'string' ? file : 'tools/validate'}: [C17] ${message}`);
    console.error('validate: 1 件のエラー');
    process.exitCode = 1;
    return;
  }

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
}

main();
