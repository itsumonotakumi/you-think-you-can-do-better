// YAML を読み、値の位置（ファイル・行）を引けるようにする。
import { parseDocument, LineCounter, isMap, isSeq } from 'yaml';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

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

function register(node: any, value: unknown, file: string, lc: LineCounter): void {
  if (value === null || typeof value !== 'object') return;
  if (!node) return;
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
        register(pair.value, child, file, lc);
      }
    }
  } else if (isSeq(node)) {
    for (let i = 0; i < node.items.length; i += 1) {
      const item = node.items[i];
      if (!item) continue;
      origin.items.set(i, lineOfNode(item, lc));
      const child = (value as unknown[])[i];
      if (child !== null && typeof child === 'object') register(item, child, file, lc);
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
}

export function parseYamlText(file: string, text: string): ParsedSource {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter });
  const errors = doc.errors.map((e) => ({
    line: e.linePos?.[0]?.line ?? 1,
    message: e.message.split('\n')[0] ?? e.message,
  }));
  const data = doc.toJS();
  if (doc.contents) register(doc.contents, data, file, lineCounter);
  return { file, data, errors };
}

export function readYaml(root: string, relativePath: string): ParsedSource | null {
  const full = join(root, relativePath);
  if (!existsSync(full)) return null;
  return parseYamlText(relativePath.replaceAll('\\', '/'), readFileSync(full, 'utf8'));
}

/** テスト・呼び出し側で位置を作るための小さなヘルパー。 */
export function position(file: string, line: number): Location {
  return { file, line };
}
