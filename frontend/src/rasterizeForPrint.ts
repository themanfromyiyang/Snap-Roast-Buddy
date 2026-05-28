// 把一条 PhotoRecord 渲染成 1bpp 黑白位图字节流，准备喂给 ESP32 走热敏打印机。
//
// 设计要点：
// - 宽度固定 384 dots（58mm 标准），高度按内容堆叠后总和。
// - 阈值化：简单 luma<128 = 黑，省事；对比强烈的小票完全够看。
// - 输出含 4 字节小端头：[widthLo, widthHi, heightLo, heightHi]，方便 ESP32 一次性读到尺寸。
// - 支持 4 种组合：纯 SVG / 纯漫画 / SVG+漫画(top) / SVG+漫画(bottom)。

const PRINT_WIDTH_DOTS = 384;
const BYTES_PER_ROW = PRINT_WIDTH_DOTS / 8; // 48

type Segment = { type: "svg" | "image"; source: string };

export type RecordLike = {
  ticketHtml?: string;
  sketchImageUrl?: string;
  sketchMode?: "none" | "top" | "bottom" | "standalone";
};

export type PrintBitmap = {
  widthDots: number;
  heightDots: number;
  bytes: Uint8Array;       // 仅位图字节
  payload: Uint8Array;     // 4 字节头 + 位图字节，直接给上传接口
};

export async function rasterizeRecordForPrint(record: RecordLike): Promise<PrintBitmap> {
  const segments = collectSegments(record);
  if (segments.length === 0) {
    throw new Error("没有可打印内容（既无 ticketHtml 也无 sketchImageUrl）。");
  }

  const loaded = await Promise.all(segments.map(loadSegment));
  const totalHeight = loaded.reduce((acc, s) => acc + s.renderHeight, 0);
  if (totalHeight <= 0) throw new Error("渲染高度为 0。");

  const canvas = document.createElement("canvas");
  canvas.width = PRINT_WIDTH_DOTS;
  canvas.height = totalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("浏览器不支持 2D canvas。");

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, PRINT_WIDTH_DOTS, totalHeight);
  let y = 0;
  for (const seg of loaded) {
    ctx.drawImage(seg.img, 0, y, PRINT_WIDTH_DOTS, seg.renderHeight);
    y += seg.renderHeight;
  }

  const imageData = ctx.getImageData(0, 0, PRINT_WIDTH_DOTS, totalHeight);
  const bytes = packToOneBpp(imageData.data, PRINT_WIDTH_DOTS, totalHeight);

  const payload = new Uint8Array(4 + bytes.length);
  payload[0] = PRINT_WIDTH_DOTS & 0xff;
  payload[1] = (PRINT_WIDTH_DOTS >> 8) & 0xff;
  payload[2] = totalHeight & 0xff;
  payload[3] = (totalHeight >> 8) & 0xff;
  payload.set(bytes, 4);

  return { widthDots: PRINT_WIDTH_DOTS, heightDots: totalHeight, bytes, payload };
}

function collectSegments(record: RecordLike): Segment[] {
  const segments: Segment[] = [];
  const mode = record.sketchMode ?? "none";

  if (mode === "standalone" && record.sketchImageUrl) {
    segments.push({ type: "image", source: record.sketchImageUrl });
    return segments;
  }
  if (mode === "top" && record.sketchImageUrl) {
    segments.push({ type: "image", source: record.sketchImageUrl });
  }
  if (record.ticketHtml) {
    segments.push({ type: "svg", source: record.ticketHtml });
  }
  if (mode === "bottom" && record.sketchImageUrl) {
    segments.push({ type: "image", source: record.sketchImageUrl });
  }
  // 兜底：only sketchImageUrl, mode=none
  if (segments.length === 0 && record.sketchImageUrl) {
    segments.push({ type: "image", source: record.sketchImageUrl });
  }
  return segments;
}

async function loadSegment(seg: Segment): Promise<{ img: HTMLImageElement; renderHeight: number }> {
  const img = await loadImage(seg);
  const naturalW = img.naturalWidth || PRINT_WIDTH_DOTS;
  const naturalH = img.naturalHeight || PRINT_WIDTH_DOTS;
  const renderHeight = Math.max(1, Math.round((naturalH / naturalW) * PRINT_WIDTH_DOTS));
  return { img, renderHeight };
}

function loadImage(seg: Segment): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // 跨域图（Supabase Storage / 第三方 URL）必须设这个，否则 getImageData 会污染 canvas 报错
    img.crossOrigin = "anonymous";

    let cleanupUrl = "";
    img.onload = () => {
      if (cleanupUrl) URL.revokeObjectURL(cleanupUrl);
      resolve(img);
    };
    img.onerror = () => {
      if (cleanupUrl) URL.revokeObjectURL(cleanupUrl);
      reject(new Error(`图像加载失败: ${seg.type}`));
    };

    if (seg.type === "svg") {
      const blob = new Blob([seg.source], { type: "image/svg+xml;charset=utf-8" });
      cleanupUrl = URL.createObjectURL(blob);
      img.src = cleanupUrl;
    } else {
      img.src = seg.source;
    }
  });
}

function packToOneBpp(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const bytesPerRow = width / 8;
  const out = new Uint8Array(bytesPerRow * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = rgba[i];
      const g = rgba[i + 1];
      const b = rgba[i + 2];
      const a = rgba[i + 3];
      // 透明像素当成白底
      const luma = a < 16 ? 255 : (r + g + b) / 3;
      if (luma < 128) {
        out[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }
  return out;
}

export function recordHasPrintableContent(record: RecordLike): boolean {
  return Boolean(record.ticketHtml || record.sketchImageUrl);
}

export const PRINT_WIDTH_DOTS_CONST = PRINT_WIDTH_DOTS;
export const BYTES_PER_ROW_CONST = BYTES_PER_ROW;
