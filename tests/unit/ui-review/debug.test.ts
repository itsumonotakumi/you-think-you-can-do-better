import { afterEach, describe, expect, it } from 'vitest';
import { isDebug, isDebugUrl } from '../../../src/app/debug';

const originalLocation = globalThis.location;

function setLocation(href: string | undefined): void {
  if (href === undefined) {
    delete (globalThis as { location?: unknown }).location;
    return;
  }
  (globalThis as { location?: { href: string } }).location = { href };
}

afterEach(() => {
  if (originalLocation === undefined) {
    delete (globalThis as { location?: unknown }).location;
  } else {
    (globalThis as { location?: unknown }).location = originalLocation;
  }
});

describe('isDebugUrl', () => {
  it('?debug=1 をデバッグ表示とみなす', () => {
    expect(isDebugUrl('http://localhost:5173/?debug=1')).toBe(true);
    expect(isDebugUrl('http://localhost:5173/index.html?debug=1')).toBe(true);
    expect(isDebugUrl('http://localhost:5173/?a=1&debug=1')).toBe(true);
    expect(isDebugUrl('http://localhost:5173/?debug=1#review')).toBe(true);
  });

  it('#debug でもデバッグ表示とみなす', () => {
    expect(isDebugUrl('http://localhost:5173/#debug')).toBe(true);
    expect(isDebugUrl('http://localhost:5173/#debug=1')).toBe(true);
    expect(isDebugUrl('http://localhost:5173/#?debug=1')).toBe(true);
    expect(isDebugUrl('http://localhost:5173/?a=1#debug')).toBe(true);
  });

  it('値が空でも debug ならデバッグ表示とみなす', () => {
    expect(isDebugUrl('http://localhost:5173/?debug')).toBe(true);
    expect(isDebugUrl('http://localhost:5173/#debug')).toBe(true);
  });

  it('debug=0 や別のキーでは表示しない', () => {
    expect(isDebugUrl('http://localhost:5173/?debug=0')).toBe(false);
    expect(isDebugUrl('http://localhost:5173/?debug=false')).toBe(false);
    expect(isDebugUrl('http://localhost:5173/?debugger=1')).toBe(false);
    expect(isDebugUrl('http://localhost:5173/?a=1#review')).toBe(false);
    expect(isDebugUrl('http://localhost:5173/')).toBe(false);
  });

  it('true/on/yes も受け付ける', () => {
    for (const value of ['true', 'on', 'yes', 'TRUE']) {
      expect(isDebugUrl(`http://localhost/?debug=${value}`), value).toBe(true);
    }
  });
});

describe('isDebug', () => {
  it('URL が無い環境では false', () => {
    setLocation(undefined);
    expect(isDebug()).toBe(false);
  });

  it('現在の URL から判定する', () => {
    setLocation('http://localhost:5173/?debug=1');
    expect(isDebug()).toBe(true);
    setLocation('http://localhost:5173/#debug');
    expect(isDebug()).toBe(true);
    setLocation('http://localhost:5173/');
    expect(isDebug()).toBe(false);
  });
});
