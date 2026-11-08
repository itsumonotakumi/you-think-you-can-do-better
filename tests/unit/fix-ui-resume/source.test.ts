// 画面・音・i18n の静的確認（見落としやすい結線を見る）。
import { describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
// @ts-ignore -- @types/node は入れていない（依存追加禁止）。Vitest は Node 上で動く。
import { readFileSync } from 'node:fs';

function read(path: string): string {
  return readFileSync(new URL(`../../../src/${path}`, import.meta.url).pathname, 'utf8') as string;
}

const s01 = read('app/screens/S01Title.svelte');
const s03 = read('app/screens/S03ScenarioSelect.svelte');
const s10 = read('app/screens/S10Settings.svelte');
const i18n = read('i18n/index.ts');

describe('S01 の「続きから」', () => {
  it('音を有効化してから再開する', () => {
    const resumeStart = s01.indexOf('async function resume()');
    const resumeBody = s01.slice(resumeStart, s01.indexOf('function open(', resumeStart));
    expect(resumeBody).toContain('audio.unlock()');
    expect(resumeBody).toContain('audio.playBgm(resumeBgm(');
  });

  it('再開先と BGM を状態から決める', () => {
    expect(s01).toContain("if (state.finished) return 'S08'");
    expect(s01).toContain("if (state.press) return 'S07'");
    expect(s01).toContain("if (state.pendingDraft) return 'S06'");
    expect(s01).toContain("if (resumeScreen(state) === 'S07') return 'press'");
    expect(s01).toContain('scenario.audio.bgmByPhase?.[state.phase] ?? scenario.audio.bgmDefault');
  });

  it('版が違えば保存を消してシナリオ選択へ戻す', () => {
    const resumeStart = s01.indexOf('async function resume()');
    const resumeBody = s01.slice(resumeStart, s01.indexOf('function open(', resumeStart));
    expect(resumeBody).toContain('versionChanged(saved, sc)');
    expect(resumeBody).toContain('saveProgress(null)');
    expect(resumeBody).toContain('setPendingNotice(versionChangedNotice(');
    expect(resumeBody).toContain("screen.set('S03')");
  });

  it('言語変更は applyLang を使う', () => {
    expect(s01).toContain('applyLang(lang)');
    expect(s01).not.toContain('setLang(lang)');
  });
});

describe('S03 のタイトルへ戻る', () => {
  it('コンパイルできて、常設の戻るボタンがある', () => {
    expect(compile(s03, { filename: 'S03ScenarioSelect.svelte', generate: 'client' }).js.code.length)
      .toBeGreaterThan(0);
    expect(s03).toContain('function backToTitle()');
    expect(s03).toContain("screen.set('S01')");
    // 画面末尾の戻るボタンは、読み込み中・失敗・空一覧の分岐より後ろに置く
    expect(s03.indexOf('onclick={backToTitle}')).toBeGreaterThan(s03.lastIndexOf('{/if}'));
  });

  it('遷移時の連絡を表示できる', () => {
    expect(s03).toContain('takePendingNotice()');
    expect(s03).toContain('{#if transitionNotice}');
  });
});

describe('S10 の音の失敗表示', () => {
  it('onLoadError を購読して表示を更新する', () => {
    expect(s10).toContain('audio.onLoadError(');
    expect(s10).toContain('audio.hasLoadError()');
  });

  it('言語変更は applyLang を使う', () => {
    expect(s10).toContain('applyLang(next.lang)');
    expect(s10).not.toContain('setLang(');
  });
});

describe('i18n の共通処理', () => {
  it('applyLang は文書の lang も更新する', () => {
    expect(i18n).toContain('export function applyLang(');
    expect(i18n).toContain('document.documentElement.lang = lang');
  });
});
