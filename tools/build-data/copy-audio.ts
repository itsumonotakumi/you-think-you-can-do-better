// ビルド後に audio/{bgm,se}/*.mp3 を dist/audio/ にコピーする（音声は公開リポジトリに置かず、配信物にだけ含める）
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const root = process.cwd();
let n = 0;
for (const kind of ['bgm', 'se']) {
  const src = join(root, 'audio', kind);
  if (!existsSync(src)) continue;
  const dst = join(root, 'dist', 'audio', kind);
  mkdirSync(dst, { recursive: true });
  for (const f of readdirSync(src)) {
    if (!/^[a-z0-9_]+\.mp3$/.test(f)) continue;
    copyFileSync(join(src, f), join(dst, f));
    n++;
  }
}
console.log(`copy-audio: ${n} ファイル`);
