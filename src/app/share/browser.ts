// 保存・コピー・Web Share API の薄いラッパ。担当: f-share。
// 非対応の端末では false を返し、画面側が保存＋コピーの案内に切り替える。

function toFile(blob: Blob, filename: string): File | null {
  try {
    return new File([blob], filename, { type: blob.type || 'image/png' });
  } catch {
    return null;
  }
}

/** 画像を端末に保存する */
export function downloadBlob(blob: Blob, filename: string, doc: Document = document): void {
  const url = URL.createObjectURL(blob);
  const link = doc.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  doc.body.appendChild(link);
  link.click();
  link.remove();
  // すぐに revoke するとダウンロードが始まらない端末があるため遅らせる
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** 投稿文をクリップボードへ。使えなければ選択して copy を試す */
export async function copyText(
  text: string,
  nav: Navigator = navigator,
  doc: Document = document,
): Promise<boolean> {
  try {
    if (nav.clipboard && typeof nav.clipboard.writeText === 'function') {
      await nav.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 権限が無い場合は下の方法へ
  }
  try {
    const area = doc.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '0';
    area.style.opacity = '0';
    doc.body.appendChild(area);
    area.select();
    const copied = typeof doc.execCommand === 'function' && doc.execCommand('copy');
    area.remove();
    return copied;
  } catch {
    return false;
  }
}

/** この端末が画像ファイルの共有に対応しているか */
export function canShareFiles(
  blob: Blob,
  filename: string,
  nav: Navigator = navigator,
): boolean {
  try {
    if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false;
    const file = toFile(blob, filename);
    return file !== null && nav.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** Web Share API で画像と投稿文を渡す。共有できなければ false */
export async function shareFiles(
  blob: Blob,
  filename: string,
  text: string,
  url: string,
  nav: Navigator = navigator,
): Promise<boolean> {
  try {
    if (typeof nav.share !== 'function') return false;
    const file = toFile(blob, filename);
    if (file === null) return false;
    if (typeof nav.canShare === 'function' && !nav.canShare({ files: [file] })) return false;
    const payload: ShareData = { text, files: [file] };
    if (url) payload.url = url;
    await nav.share(payload);
    return true;
  } catch {
    return false;
  }
}
