// drafts のキー参照（Object.hasOwn）と、危険な予約語の ID・旗キーの禁止。
import { describe, it, expect, afterEach } from 'vitest';
import { validateFixture } from '../validate/helpers.ts';
import type { TestFiles, ValidatedProject } from '../validate/helpers.ts';

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function run(mutate: (files: TestFiles) => void): ValidatedProject {
  const project = validateFixture(mutate);
  cleanups.push(project.cleanup);
  return project;
}

function messages(project: ValidatedProject): string[] {
  return project.result.errors.map((issue) => issue.message);
}

/** __proto__ を「own プロパティ」として持つオブジェクトを作る */
function ownProtoKey(value: unknown): Record<string, unknown> {
  return JSON.parse(`{"__proto__": ${JSON.stringify(value)}}`);
}

describe('drafts のキー参照', () => {
  it('detail: __proto__ は drafts キーがないとエラー（継承プロパティを拾わない）', () => {
    const project = run((files) => {
      files.roles.executive.points[0]!.choices[0]!.detail = '__proto__';
    });
    expect(messages(project).some((m) => m.includes('detail の drafts キーがない'))).toBe(true);
  });

  it('detail: toString も drafts キーがないとエラー', () => {
    const project = run((files) => {
      files.roles.executive.points[0]!.choices[0]!.detail = 'toString';
    });
    expect(messages(project).some((m) => m.includes('detail の drafts キーがない'))).toBe(true);
  });
});

describe('危険な予約語の禁止', () => {
  it('選択肢の id', () => {
    const project = run((files) => {
      files.roles.executive.points[0]!.choices[0]!.id = '__proto__';
    });
    expect(messages(project).some((m) => m.includes('選択肢の id に使えない予約語'))).toBe(true);
  });

  it('スロット（部品）の id', () => {
    const project = run((files) => {
      files.roles.executive.drafts.draft1.slots[1]!.id = 'constructor';
    });
    expect(messages(project).some((m) => m.includes('部品の id に使えない予約語'))).toBe(true);
  });

  it('細目の id', () => {
    const project = run((files) => {
      files.roles.executive.points[0]!.choices[0]!.items[0]!.id = 'prototype';
    });
    expect(messages(project).some((m) => m.includes('細目の id に使えない予約語'))).toBe(true);
  });

  it('旗（setFlags）のキー', () => {
    const project = run((files) => {
      files.roles.executive.points[0]!.choices[0]!.setFlags = ownProtoKey(true);
    });
    expect(messages(project).some((m) => m.includes('フラグのキーに使えない予約語'))).toBe(true);
  });

  it('旗（when.flags）のキー', () => {
    const project = run((files) => {
      files.roles.executive.points[0]!.when = { flags: { constructor: true } };
    });
    expect(messages(project).some((m) => m.includes('when.flags のキーに使えない予約語'))).toBe(true);
  });

  it('flag トリガーのキー', () => {
    const project = run((files) => {
      files.roles.executive.voices[0]!.trigger = { flags: { prototype: true } };
    });
    expect(messages(project).some((m) => m.includes('trigger.flags のキーに使えない予約語'))).toBe(true);
  });
});
