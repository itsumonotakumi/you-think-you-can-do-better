// 一時スクリプト: _data-<role>.mjs の内容を roles/<role>.yaml に反映して並び替える。
import { readFileSync, writeFileSync } from 'node:fs';

const role = process.argv[2];
if (!role) throw new Error('role を指定');

const { choices, lessons, options } = await import(new URL(`./_data-${role}.mjs`, import.meta.url).href);
const file = new URL(`./roles/${role}.yaml`, import.meta.url);
let lines = readFileSync(file, 'utf8').split('\n');

const quote = (s) => {
  if (s.includes("'") || /[,:]/.test(s)) return `"${s.replace(/"/g, '\\"')}"`;
  return `'${s}'`;
};

/** 6スペースの "- id:" を選択肢ブロックとして拾う */
function scanBlocks(src) {
  const blocks = [];
  for (let i = 0; i < src.length; i += 1) {
    const m = src[i].match(/^      - id: (\S+)$/);
    if (!m) continue;
    let j = i + 1;
    while (j < src.length) {
      const l = src[j];
      if (l.trim() === '') break;
      if (/^ {0,6}\S/.test(l)) break;
      j += 1;
    }
    const body = src.slice(i, j);
    if (!body.some((l) => /^        text: \{ ja:/.test(l)) || !body.some((l) => /^        points: /.test(l))) {
      i = j - 1;
      continue;
    }
    blocks.push({ id: m[1], start: i, end: j });
    i = j - 1;
  }
  return blocks;
}

/** 連続するブロックをポイント単位にまとめる */
function groupBlocks(src, blocks) {
  const groups = [];
  for (const block of blocks) {
    const prev = groups.at(-1);
    const between = prev ? src.slice(prev.at(-1).end, block.start) : [];
    const isNew = !prev || between.some((l) => /^  - id: /.test(l));
    if (isNew) groups.push([block]);
    else prev.push(block);
  }
  return groups;
}

// ---- 本文と解説を差し替え（後ろから処理して位置ずれを避ける）----
{
  const blocks = scanBlocks(lines);
  const seen = new Set();
  for (const block of [...blocks].reverse()) {
    const d = choices[block.id];
    if (!d) throw new Error(`本文データがない選択肢: ${block.id} (${role})`);
    seen.add(block.id);
    const body = lines.slice(block.start, block.end);
    const out = [];
    let hit = false;
    for (const line of body) {
      if (!/^        text: \{ ja: '.*', en: '' \}$/.test(line)) {
        out.push(line);
        continue;
      }
      hit = true;
      out.push(`        text: { ja: ${quote(d.text)}, en: '' }`);
      out.push(`        explain: { ja: ${quote(d.explain)}, en: '' }`);
    }
    if (!hit) throw new Error(`text 行がない: ${block.id}`);
    lines = [...lines.slice(0, block.start), ...out, ...lines.slice(block.end)];
  }
  for (const id of Object.keys(choices)) {
    if (!seen.has(id)) throw new Error(`YAML にない選択肢: ${id} (${role})`);
  }
}

// ---- グループ内の並び替え（最高点の位置を均等に散らす）----
{
  const blocks = scanBlocks(lines);
  const groups = groupBlocks(lines, blocks);
  let groupIndex = 0;
  for (const group of groups) {
    const n = group.length;
    if (n < 2) {
      groupIndex += 1;
      continue;
    }
    const pointsOf = (block) => {
      const line = lines.slice(block.start, block.end).find((l) => /^        points: -?\d+$/.test(l));
      return Number(line.match(/-?\d+/)[0]);
    };
    const points = group.map(pointsOf);
    const bestIndex = points.indexOf(Math.max(...points));
    const target = groupIndex % n;
    const rest = group.filter((_, i) => i !== bestIndex);
    const ordered = new Array(n).fill(null);
    ordered[target] = group[bestIndex];
    let k = 0;
    for (let i = 0; i < n; i += 1) if (!ordered[i]) ordered[i] = rest[k++];
    const first = group[0].start;
    const last = group.at(-1).end;
    const merged = ordered.flatMap((block) => lines.slice(block.start, block.end));
    lines = [...lines.slice(0, first), ...merged, ...lines.slice(last)];
    groupIndex += 1;
  }
}

// ---- 各判断に lesson を入れる（choices: の直前）----
{
  const seenLesson = new Set();
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i] !== '    choices:') continue;
    let pointId = null;
    for (let j = i - 1; j >= 0; j -= 1) {
      const m = lines[j].match(/^  - id: (\S+)$/);
      if (m) {
        pointId = m[1];
        break;
      }
    }
    if (!pointId || !lessons[pointId]) throw new Error(`lesson がない: ${pointId}`);
    seenLesson.add(pointId);
    lines.splice(i, 0, `    lesson: { ja: ${quote(lessons[pointId])}, en: '' }`);
    i += 1;
  }
  for (const id of Object.keys(lessons)) {
    if (!seenLesson.has(id)) throw new Error(`YAML にない判断: ${id} (${role})`);
  }
}

// ---- drafts の options の並び替え（最高点を散らす）----
{
  const isOpt = (line) => /^          - \{ id: \S+, .*text: \{ ja:/.test(line);
  const groups = [];
  const idxs = lines.map((line, i) => (isOpt(line) ? i : -1)).filter((i) => i >= 0);
  for (const i of idxs) {
    const prev = groups.at(-1);
    if (prev && i === prev.at(-1) + 1) prev.push(i);
    else groups.push([i]);
  }
  let slotIndex = 0;
  for (const group of groups) {
    const n = group.length;
    if (n < 2) {
      slotIndex += 1;
      continue;
    }
    const pointsOf = (i) => Number(lines[i].match(/points: (-?\d+)/)[1]);
    const points = group.map(pointsOf);
    const best = points.indexOf(Math.max(...points));
    const target = slotIndex % n;
    const ordered = new Array(n).fill(null);
    ordered[target] = lines[group[best]];
    const rest = group.filter((_, i) => i !== best).map((i) => lines[i]);
    let k = 0;
    for (let i = 0; i < n; i += 1) if (!ordered[i]) ordered[i] = rest[k++];
    group.forEach((lineIndex, i) => {
      lines[lineIndex] = ordered[i];
    });
    slotIndex += 1;
  }
}

// ---- drafts の options を差し替え ----
{
  const seenOpt = new Set();
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(/^          - \{ id: (\S+), /);
    if (!m || !lines[i].includes('text: { ja:')) continue;
    const d = options[m[1]];
    if (!d) throw new Error(`文案データがない選択肢: ${m[1]} (${role})`);
    seenOpt.add(m[1]);
    let line = lines[i].replace(/text: \{ ja: '[^']*', en: '' \}/, `text: { ja: ${quote(d.text)}, en: '' }`);
    line = line.replace(/\}\s*$/, `, explain: { ja: ${quote(d.explain)}, en: '' } }`);
    lines[i] = line;
  }
  for (const id of Object.keys(options)) {
    if (!seenOpt.has(id)) throw new Error(`YAML にない文案選択肢: ${id} (${role})`);
  }
}

writeFileSync(file, lines.join('\n'), 'utf8');
console.log(`${role}: choices ${Object.keys(choices).length} / lessons ${Object.keys(lessons).length} / options ${Object.keys(options).length}`);
