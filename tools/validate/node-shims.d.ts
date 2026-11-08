// @types/node を追加しないための最小限の型宣言（ビルド時のみ使う API だけ）
declare module 'node:fs' {
  export interface Dirent {
    name: string;
    isDirectory(): boolean;
    isFile(): boolean;
  }
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function readFileSync(path: string): Uint8Array;
  export function writeFileSync(path: string, data: string): void;
  export function existsSync(path: string): boolean;
  export function readdirSync(path: string): string[];
  export function readdirSync(path: string, options: { withFileTypes: true }): Dirent[];
  export interface Stats {
    size: number;
    isFile(): boolean;
    isDirectory(): boolean;
  }
  export function statSync(path: string): Stats;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
  export function renameSync(oldPath: string, newPath: string): void;
  export function mkdtempSync(prefix: string): string;
}

declare module 'node:path' {
  export function join(...parts: string[]): string;
  export function dirname(p: string): string;
  export function basename(p: string, ext?: string): string;
  export function relative(from: string, to: string): string;
  export function resolve(...parts: string[]): string;
  export const sep: string;
}

declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}

declare module 'node:child_process' {
  export function spawnSync(
    command: string,
    args?: string[],
    options?: { cwd?: string; encoding?: 'utf8' },
  ): { status: number | null; stdout: string; stderr: string };
}

declare module 'node:os' {
  export function tmpdir(): string;
}

declare module 'node:process' {
  interface WritableLike {
    write(chunk: string): boolean;
  }
  const process: {
    cwd(): string;
    argv: string[];
    exitCode?: number;
    stdout: WritableLike;
    stderr: WritableLike;
  };
  export default process;
}
