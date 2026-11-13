// シェア画像（1200×630）を端末内の canvas で描く。担当: f-share。
// 外部サービス・乱数・現在時刻は使わない。挿絵が読めなければ無地にする。
import type { Lang, Rank } from '../../engine/types';
import type { ShareCard } from './data';

export const SHARE_IMAGE_WIDTH = 1200;
export const SHARE_IMAGE_HEIGHT = 630;

const FONT = '"Noto Sans JP", "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif';
const BG = '#0f172a';
const TEXT = '#f8fafc';
const SOFT = '#cbd5e1';
const MUTED = '#94a3b8';

const RANK_COLOR: Record<Rank, string> = {
  S: '#f59e0b',
  A: '#38bdf8',
  B: '#34d399',
  C: '#cbd5e1',
  D: '#f87171',
};

interface ImageLabels {
  score: string;
  playCount: (count: number) => string;
  headline: string;
  achievement: string;
}

const LABELS: Record<Lang, ImageLabels> = {
  ja: {
    score: '公式スコア',
    playCount: (count) => `${count}回目`,
    headline: '翌朝の新聞',
    achievement: '称号',
  },
  en: {
    score: 'Score',
    playCount: (count) => `Play ${count}`,
    headline: "Next morning's headline",
    achievement: 'Title',
  },
};

export interface DrawOptions {
  width?: number;
  height?: number;
  /** 薄く敷く挿絵。null / 未指定なら無地 */
  illustration?: CanvasImageSource | null;
}

/** 幅に収まるまで1文字ずつ折り返す（日本語には空白が無いため） */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  let line = '';
  for (const char of Array.from(text)) {
    if (char === '\n') {
      lines.push(line);
      line = '';
      continue;
    }
    const next = line + char;
    if (line !== '' && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = char;
    } else {
      line = next;
    }
  }
  if (line !== '') lines.push(line);
  return lines.length > 0 ? lines : [''];
}

/** 幅に収まるよう末尾を「…」で切る */
export function truncateToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = '';
  for (const char of Array.from(text)) {
    if (ctx.measureText(`${out}${char}…`).width > maxWidth) break;
    out += char;
  }
  return out === '' ? '…' : `${out}…`;
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  width: number,
  height: number,
): void {
  const size = image as { width?: number; height?: number };
  const imageWidth = size.width ?? 0;
  const imageHeight = size.height ?? 0;
  if (imageWidth <= 0 || imageHeight <= 0) {
    ctx.drawImage(image, 0, 0, width, height);
    return;
  }
  const scale = Math.max(width / imageWidth, height / imageHeight);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

/** 画像を描く。canvas の確保と挿絵の読み込みは呼び出し側が行う */
export function drawShareImage(
  ctx: CanvasRenderingContext2D,
  card: ShareCard,
  options: DrawOptions = {},
): void {
  const width = options.width ?? SHARE_IMAGE_WIDTH;
  const height = options.height ?? SHARE_IMAGE_HEIGHT;
  const pad = Math.round(width * 0.055);
  const labels = LABELS[card.lang];
  const accent = RANK_COLOR[card.rank];

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, width, height);

  if (options.illustration) {
    ctx.save();
    ctx.globalAlpha = 0.18;
    drawCover(ctx, options.illustration, width, height);
    ctx.restore();
    // 文字を読めるように暗い膜をかける
    ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.fillRect(0, 0, width, height);
  }

  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, width, 8);

  // 上部: 製品名とハッシュタグ
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = `600 24px ${FONT}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(card.product, pad, 80);
  ctx.textAlign = 'right';
  ctx.fillText(card.hashtag, width - pad, 80);

  // 題名（2行まで）
  ctx.textAlign = 'left';
  ctx.fillStyle = TEXT;
  ctx.font = `700 56px ${FONT}`;
  const titleMaxWidth = width - pad * 2 - 300;
  const titleLines = wrapText(ctx, card.title, titleMaxWidth).slice(0, 2);
  titleLines.forEach((line, index) => {
    ctx.fillText(line, pad, 172 + index * 64);
  });

  // ロールとプレイ回数
  ctx.font = `500 28px ${FONT}`;
  ctx.fillStyle = SOFT;
  ctx.fillText(`${card.role} / ${labels.playCount(card.playCount)}`, pad, 300);

  if (card.achievement) {
    ctx.font = `600 24px ${FONT}`;
    ctx.fillStyle = accent;
    ctx.fillText(
      truncateToWidth(ctx, `${labels.achievement}: ${card.achievement}`, width - pad * 2 - 300),
      pad,
      342,
    );
  }

  // スコア
  ctx.font = `500 22px ${FONT}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(labels.score, pad, 408);
  ctx.font = `800 72px ${FONT}`;
  ctx.fillStyle = TEXT;
  ctx.fillText(String(card.score), pad, 472);

  // 翌朝の新聞見出し（任意）
  if (card.headline) {
    ctx.fillStyle = accent;
    ctx.fillRect(pad, 506, 6, 64);
    ctx.font = `500 18px ${FONT}`;
    ctx.fillStyle = MUTED;
    ctx.fillText(labels.headline, pad + 22, 526);
    ctx.font = `600 30px ${FONT}`;
    ctx.fillStyle = TEXT;
    ctx.fillText(
      truncateToWidth(ctx, card.headline, width - pad * 2 - 30),
      pad + 22,
      562,
    );
  }

  // 下部: ハッシュタグとURL
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = `500 22px ${FONT}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(card.hashtag, pad, height - 30);
  if (card.url) {
    ctx.textAlign = 'right';
    ctx.fillText(
      truncateToWidth(ctx, card.url, Math.round(width * 0.45)),
      width - pad,
      height - 30,
    );
  }

  // ランク（右側の丸）
  const rankX = width - pad - 105;
  const rankY = 250;
  const radius = 100;
  ctx.beginPath();
  ctx.arc(rankX, rankY, radius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = accent;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = accent;
  ctx.font = `800 148px ${FONT}`;
  ctx.fillText(card.rank, rankX, rankY + 6);

  ctx.restore();
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (!src || typeof Image === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

/** 画面の canvas に描く。挿絵は読めなければ無視する */
export async function renderShareCanvas(
  canvas: HTMLCanvasElement,
  card: ShareCard,
): Promise<void> {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d is not available');
  const illustration = await loadImage(card.illustrationUrl);
  drawShareImage(ctx, card, {
    width: canvas.width || SHARE_IMAGE_WIDTH,
    height: canvas.height || SHARE_IMAGE_HEIGHT,
    illustration,
  });
}

/** 保存・共有用の PNG */
export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  if (typeof canvas.toBlob !== 'function') return Promise.resolve(null);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}
