// 一時スクリプト: 選択肢の長さ・並び・解説の検査
import { readFileSync } from 'node:fs';
import YAML from 'yaml';

const roles = process.argv.slice(2).length ? process.argv.slice(2) : ['executive', 'officer', 'lead', 'analyst'];
let problems = 0;
for (const role of roles) {
  const d = YAML.parse(readFileSync(new URL(`./roles/${role}.yaml`, import.meta.url), 'utf8'));
  const bestPos = [];
  console.log(`== ${role}`);
  for (const p of d.points) {
    const lens = p.choices.map((c) => c.text.ja.length);
    const ratio = Math.max(...lens) / Math.min(...lens);
    const maxPts = Math.max(...p.choices.map((c) => c.points));
    const idx = p.choices.findIndex((c) => c.points === maxPts);
    bestPos.push(idx);
    if (ratio > 1.3) {
      console.log(`  LEN ${p.id} ratio=${ratio.toFixed(2)} ${p.choices.map((c) => `${c.id}:${c.text.ja.length}`).join(' ')}`);
      problems += 1;
    }
    if (!p.lesson) {
      console.log(`  LESSONなし ${p.id}`);
      problems += 1;
    } else if (p.lesson.ja.length < 80 || p.lesson.ja.length > 200) {
      console.log(`  LESSON長 ${p.id} ${p.lesson.ja.length}`);
      problems += 1;
    } else if (p.lesson.en !== '') {
      console.log(`  LESSON enが空でない ${p.id}`);
      problems += 1;
    }
    for (const c of p.choices) {
      if (!c.explain) {
        console.log(`  EXPLAINなし ${c.id}`);
        problems += 1;
      } else if (c.explain.ja.length < 40 || c.explain.ja.length > 120) {
        console.log(`  EXPLAIN長 ${c.id} ${c.explain.ja.length}`);
        problems += 1;
      } else if (c.explain.en !== '') {
        console.log(`  EXPLAIN enが空でない ${c.id}`);
        problems += 1;
      }
    }
  }
  console.log(`  best position: ${bestPos.join(',')}`);
  for (const [key, draft] of Object.entries(d.drafts ?? {})) {
    for (const slot of draft.slots) {
      if (!slot.options) continue;
      const lens = slot.options.map((o) => o.text.ja.length);
      const ratio = Math.max(...lens) / Math.min(...lens);
      if (ratio > 1.3) {
        console.log(`  DRAFT-LEN ${key}/${slot.id} ratio=${ratio.toFixed(2)} ${slot.options.map((o) => `${o.id}:${o.text.ja.length}`).join(' ')}`);
        problems += 1;
      }
      for (const o of slot.options) {
        if (!o.explain) {
          console.log(`  DRAFT-EXPLAINなし ${o.id}`);
          problems += 1;
        } else if (o.explain.ja.length < 40 || o.explain.ja.length > 120) {
          console.log(`  DRAFT-EXPLAIN長 ${o.id} ${o.explain.ja.length}`);
          problems += 1;
        } else if (o.explain.en !== '') {
          problems += 1;
          console.log(`  DRAFT-EXPLAIN enが空でない ${o.id}`);
        }
      }
    }
    // options の最高点の位置
    const pos = draft.slots.filter((s) => s.options).map((s) => {
      const opts = s.options;
      const max = Math.max(...opts.map((o) => o.points));
      return opts.findIndex((o) => o.points === max);
    });
    console.log(`  draft ${key} best positions: ${pos.join(',')}`);
  }
  // ASCII 記号チェック
  const bad = JSON.stringify(d).match(/[^\\"]*[,:][^"]*/g);
  if (bad) console.log(`  ASCII記号: ${bad.slice(0, 3).join(' | ')}`);
}
console.log(`problems: ${problems}`);
