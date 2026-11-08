// BGM・効果音の再生（設計書 10章）。素材が無い場合は無音で動く。
// 素材は src/data/audio.json（AudioAsset[]）から読み、URL は BASE_URL + "audio/" + file。
import type { AudioAsset, Cue } from '../engine/types';
import { FLAME_BGM } from '../engine/types';
import { loadAudioManifest } from '../data/loader';

export interface AudioController {
  /** 「はじめる」押下時に呼ぶ（自動再生制限の解除） */
  unlock(): Promise<void>;
  playBgm(id: string): void;
  playSe(id: string): void;
  setVolumes(v: { bgm: number; se: number; muted: boolean }): void;
  /** 炎上度に応じた BGM 切替（ヒステリシス付き） */
  updateFlame(flame: number): void;
  /** 演出キューの音部分だけを処理 */
  runCues(cues: Cue[]): void;
  /** 読み込みに失敗した素材があるか（設定画面に表示） */
  hasLoadError(): boolean;
}

/** 炎上度の段階。0=tension_low, 1=tension_mid, 2=tension_high */
export type TensionLevel = 0 | 1 | 2;
export const TENSION_BGM = ['tension_low', 'tension_mid', 'tension_high'] as const;

/**
 * 炎上度の段階を返す純関数。上がるときは 40/70、下がるときは 35/65 で切り替える
 * （境目を行き来しても曲がばたつかないようにする）。
 */
export function nextTensionLevel(current: TensionLevel, flame: number): TensionLevel {
  const up = FLAME_BGM.up as readonly number[];
  const down = FLAME_BGM.down as readonly number[];
  let level = current;
  if (level < 2 && flame >= up[level]!) level++;
  if (level < 2 && flame >= up[level]!) level++;
  if (level > 0 && flame < down[level - 1]!) {
    level--;
    if (level > 0 && flame < down[level - 1]!) level--;
  }
  return level as TensionLevel;
}

/** 素材の URL を組み立てる（public には置かない） */
export function resolveAudioUrl(file: string): string {
  return import.meta.env.BASE_URL + 'audio/' + file;
}

const CROSSFADE_SECONDS = 1.5;
const MAX_SAME_SE = 4;

const assets = new Map<string, AudioAsset>();
const buffers = new Map<string, AudioBuffer>();
const inflight = new Map<string, Promise<AudioBuffer | null>>();
const playingSe = new Map<string, number>();

let loadError = false;
const manifestReady: Promise<void> = loadAudioManifest()
  .then((list) => {
    for (const a of list) assets.set(a.id, a);
  })
  .catch(() => {
    loadError = true;
  });

type AudioContextCtor = new () => AudioContext;
function audioContextCtor(): AudioContextCtor | null {
  const g = globalThis as typeof globalThis & {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

let ctx: AudioContext | null = null;
let bgmMaster: GainNode | null = null;
let seMaster: GainNode | null = null;
let current: { id: string; source: AudioBufferSourceNode; gain: GainNode } | null = null;
let desiredBgm: string | null = null;
let unlocked = false;
let tensionLevel: TensionLevel = 0;
let volumes = { bgm: 0.5, se: 0.7, muted: false };

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

function canPlay(): boolean {
  return unlocked && !volumes.muted && ctx !== null;
}

function applyVolumes(): void {
  if (bgmMaster) bgmMaster.gain.value = volumes.muted ? 0 : volumes.bgm;
  if (seMaster) seMaster.gain.value = volumes.muted ? 0 : volumes.se;
}

function ensureBuffer(asset: AudioAsset): Promise<AudioBuffer | null> {
  const cached = buffers.get(asset.id);
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(asset.id);
  if (pending) return pending;

  const p = (async (): Promise<AudioBuffer | null> => {
    if (!ctx) return null;
    try {
      const res = await fetch(resolveAudioUrl(asset.file));
      if (!res.ok) throw new Error(`audio load failed: ${asset.id}`);
      const data = await res.arrayBuffer();
      const buffer = await ctx.decodeAudioData(data);
      buffers.set(asset.id, buffer);
      return buffer;
    } catch {
      loadError = true;
      return null;
    }
  })();

  inflight.set(asset.id, p);
  return p;
}

function playBgmNow(id: string, buffer: AudioBuffer): void {
  if (!ctx || !bgmMaster || !canPlay()) return;
  if (current?.id === id) return;

  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(1, now + CROSSFADE_SECONDS);
  gain.connect(bgmMaster);

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(gain);
  source.start(now);

  if (current) {
    const old = current;
    try {
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setValueAtTime(old.gain.gain.value, now);
      old.gain.gain.linearRampToValueAtTime(0, now + CROSSFADE_SECONDS);
      old.source.stop(now + CROSSFADE_SECONDS);
    } catch {
      // すでに停止済みなら何もしない
    }
  }
  current = { id, source, gain };
}

function startSe(id: string, buffer: AudioBuffer): void {
  if (!ctx || !seMaster || !canPlay()) return;
  const count = playingSe.get(id) ?? 0;
  if (count >= MAX_SAME_SE) return;

  playingSe.set(id, count + 1);

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  // 重なるほど少し抑える（通知の雪崩でうるさくしない）
  gain.gain.value = 1 / (1 + count * 0.4);
  source.connect(gain);
  gain.connect(seMaster);
  source.onended = () => {
    const left = (playingSe.get(id) ?? 1) - 1;
    if (left <= 0) playingSe.delete(id);
    else playingSe.set(id, left);
    try {
      source.disconnect();
      gain.disconnect();
    } catch {
      // noop
    }
  };
  source.start();
}

function startDesired(): void {
  if (!desiredBgm) return;
  playBgm(desiredBgm);
}

async function preloadSe(): Promise<void> {
  await manifestReady;
  for (const asset of assets.values()) {
    if (asset.kind === 'se') void ensureBuffer(asset);
  }
}

function playBgm(id: string): void {
  desiredBgm = id;
  if (!canPlay()) return;
  const asset = assets.get(id);
  if (!asset || asset.kind !== 'bgm') return; // manifest に無い ID は黙って無音

  const cached = buffers.get(id);
  if (cached) {
    playBgmNow(id, cached);
    return;
  }
  void ensureBuffer(asset).then((buffer) => {
    if (buffer && desiredBgm === id) playBgmNow(id, buffer);
  });
}

function playSe(id: string): void {
  if (!canPlay()) return;
  const asset = assets.get(id);
  if (!asset || asset.kind !== 'se') return; // manifest に無い ID は黙って無音

  const cached = buffers.get(id);
  if (cached) {
    startSe(id, cached);
    return;
  }
  void ensureBuffer(asset).then((buffer) => {
    if (buffer) startSe(id, buffer);
  });
}

export const audio: AudioController = {
  async unlock() {
    if (!ctx) {
      const Ctor = audioContextCtor();
      if (!Ctor) return; // AudioContext が無い環境（node など）では無音
      try {
        ctx = new Ctor();
        bgmMaster = ctx.createGain();
        seMaster = ctx.createGain();
        bgmMaster.connect(ctx.destination);
        seMaster.connect(ctx.destination);
        applyVolumes();
      } catch {
        ctx = null;
        bgmMaster = null;
        seMaster = null;
        return;
      }
    }
    try {
      if (ctx.state === 'suspended') await ctx.resume();
    } catch {
      return;
    }
    unlocked = true;
    await manifestReady;
    void preloadSe();
    startDesired();
  },

  playBgm,

  playSe,

  setVolumes(v) {
    volumes = { bgm: clamp01(v.bgm), se: clamp01(v.se), muted: v.muted };
    applyVolumes();
    if (!volumes.muted) startDesired();
  },

  updateFlame(flame) {
    const next = nextTensionLevel(tensionLevel, flame);
    if (next === tensionLevel) return;
    tensionLevel = next;

    const nextId = TENSION_BGM[next];
    if (current && (TENSION_BGM as readonly string[]).includes(current.id)) {
      playBgm(nextId);
    } else if (!current && desiredBgm && (TENSION_BGM as readonly string[]).includes(desiredBgm)) {
      // まだ読み込み中でも、読み込み後に正しい曲が始まるようにしておく
      playBgm(nextId);
    }
  },

  runCues(cues) {
    for (const cue of cues) {
      if (cue.kind === 'bgm') playBgm(cue.id);
      else if (cue.kind === 'se') playSe(cue.id);
    }
  },

  hasLoadError() {
    return loadError;
  },
};
