// YAML を読み、値の位置（ファイル・行）を引けるようにする。
import { parseDocument, LineCounter, isMap, isSeq } from 'yaml';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** YAML 1ファイルの上限（バイト）。 */
export const MAX_YAML_BYTES = 2 * 1024 * 1024;
/** アンカーの展開回数の上限（資源枯渇攻撃を防ぐ）。 */
export const MAX_ALIAS_COUNT = 100;

export interface Location {
  file: string;
  line: number;
}

interface NodeOrigin extends Location {
  props: Map<string, number>;
  items: Map<number, number>;
}

const registry = new WeakMap<object, NodeOrigin>();

function lineOfNode(node: any, lc: LineCounter): number {
  if (!node || !node.range) return 1;
  return lc.linePos(node.range[0]).line;
}

function register(
  node: any,
  value: unknown,
  file: string,
  lc: LineCounter,
  seen: WeakSet<object>,
): void {
  if (value === null || typeof value !== 'object') return;
  if (!node) return;
  // YAML のアンカーは循環参照を作れる。訪問済みを覚えて無限再帰を防ぐ。
  if (seen.has(value)) return;
  seen.add(value);
  const origin: NodeOrigin = {
    file,
    line: lineOfNode(node, lc),
    props: new Map(),
    items: new Map(),
  };
  registry.set(value as object, origin);

  if (isMap(node)) {
    for (const pair of node.items) {
      const key = pair.key;
      const keyName = key && typeof (key as { toJSON?: () => unknown }).toJSON === 'function'
        ? String((key as { toJSON: () => unknown }).toJSON())
        : String(key ?? '');
      if (pair.value) origin.props.set(keyName, lineOfNode(pair.value, lc));
      const child = (value as Record<string, unknown>)[keyName];
      if (pair.value && child !== null && typeof child === 'object') {
        register(pair.value, child, file, lc, seen);
      }
    }
  } else if (isSeq(node)) {
    for (let i = 0; i < node.items.length; i += 1) {
      const item = node.items[i];
      if (!item) continue;
      origin.items.set(i, lineOfNode(item, lc));
      const child = (value as unknown[])[i];
      if (child !== null && typeof child === 'object') register(item, child, file, lc, seen);
    }
  }
}

/** 値を読み込んだファイル内の行を返す。見つからなければ null。 */
export function locate(value: unknown, key?: string | number): Location | null {
  if (value === null || typeof value !== 'object') return null;
  const origin = registry.get(value as object);
  if (!origin) return null;
  if (key !== undefined) {
    const line = typeof key === 'number' ? origin.items.get(key) : origin.props.get(key);
    if (line !== undefined) return { file: origin.file, line };
  }
  return { file: origin.file, line: origin.line };
}

export interface ParsedSource {
  file: string;
  data: unknown;
  errors: { line: number; message: string }[];
  warnings: { line: number; message: string }[];
}

const decoder = new TextDecoder('utf-8');
const encoder = new TextEncoder();

function firstLine(message: string): string {
  return message.split('\n')[0] ?? message;
}

export function parseYamlText(file: string, text: string): ParsedSource {
  if (encoder.encode(text).length > MAX_YAML_BYTES) {
    return {
      file,
      data: null,
      errors: [{ line: 1, message: `ファイルが大きすぎる（上限 ${MAX_YAML_BYTES} バイト）` }],
      warnings: [],
    };
  }
  const lineCounter = new LineCounter();
  // アンカーの展開上限は toJS 側で効く（既定も 100 だが明示する）。
  const doc = parseDocument(text, { lineCounter });
  const errors = doc.errors.map((e) => ({
    line: e.linePos?.[0]?.line ?? 1,
    message: firstLine(e.message),
  }));
  const warnings = doc.warnings.map((w) => ({
    line: w.linePos?.[0]?.line ?? 1,
    message: firstLine(w.message),
  }));
  let data: unknown = null;
  try {
    data = doc.toJS({ maxAliasCount: MAX_ALIAS_COUNT });
  } catch (error) {
    errors.push({ line: 1, message: `YAML を展開できない: ${firstLine(error instanceof Error ? error.message : String(error))}` });
  }
  if (doc.contents && data !== null) register(doc.contents, data, file, lineCounter, new WeakSet());
  return { file, data, errors, warnings };
}

function fileError(displayFile: string, message: string): ParsedSource {
  return { file: displayFile, data: null, errors: [{ line: 1, message }], warnings: [] };
}

/** 絶対パスの YAML を読む。存在しなければ null。読めないときはエラーを持った結果を返す。 */
export function readYamlFile(full: string, displayFile: string): ParsedSource | null {
  // サイズは読む前に見る（巨大なファイルをメモリに載せない）
  let size: number;
  try {
    const stat = statSync(full);
    if (!stat.isFile()) {
      return fileError(displayFile, 'ファイルではなくフォルダになっている');
    }
    size = stat.size;
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return null;
    return fileError(displayFile, `ファイルを読めない: ${(error as Error).message}`);
  }
  if (size > MAX_YAML_BYTES) {
    return fileError(displayFile, `ファイルが大きすぎる（上限 ${MAX_YAML_BYTES} バイト、いま ${size} バイト）`);
  }
  let bytes: Uint8Array;
  try {
    bytes = readFileSync(full);
  } catch (error) {
    return fileError(displayFile, `ファイルを読めない: ${(error as Error).message}`);
  }
  if (bytes.length > MAX_YAML_BYTES) {
    return fileError(displayFile, `ファイルが大きすぎる（上限 ${MAX_YAML_BYTES} バイト）`);
  }
  return parseYamlText(displayFile, decoder.decode(bytes));
}

export function readYaml(root: string, relativePath: string): ParsedSource | null {
  return readYamlFile(join(root, relativePath), relativePath.replaceAll('\\', '/'));
}

/** テスト・呼び出し側で位置を作るための小さなヘルパー。 */
export function position(file: string, line: number): Location {
  return { file, line };
}
