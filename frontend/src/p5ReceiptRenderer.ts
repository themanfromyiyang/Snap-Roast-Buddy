import p5 from "p5";

type ReceiptMode = "simple" | "bigText" | "face" | "receipt" | "big_text" | "pixel_expression" | "expression";
type RoastLevel = "gentle" | "normal" | "spicy" | "execution" | "public_execution";

type RendererOptions = {
  mangaImageUrl?: string;
  mangaMode?: "none" | "top" | "bottom" | "standalone";
};

type NormalizedReceiptData = {
  title: string;
  subtitle: string;
  photoType: string;
  atmosphere: string;
  aiMood: string;
  findings: string[];
  scores: Array<{ label: string; value: number }>;
  roast: string;
  advice: string;
  verdict: string;
  topLabel: string;
  headline: string;
  subHeadline: string;
  oneLineRoast: string;
  tinyAdvice: string;
  moodLabel: string;
  keywords: string[];
  shortComment: string;
};

type ReceiptLineItem = {
  name: string;
  detail?: string;
  qty: string;
  amount: number;
  emphasis?: boolean;
};

type MachineMode = "receipt" | "bigText" | "face";

type MachineMeta = {
  title: string;
  modeLabel: string;
  modeCode: string;
  roastLabel: string;
  roastCode: string;
  issuedAt: string;
  scene: string;
  mood: string;
  evidenceNo: string;
};

type MachineInsight = {
  primaryFinding: string;
  actionHint: string;
  verdict: string;
  outputPurpose: string;
  readPath: string;
  keywords: string[];
  metrics: Array<{ label: string; value: number; note: string }>;
};

const receiptWidth = 384;
const rendererMap = new WeakMap<HTMLElement, p5>();
const fontStack = "HarmonyOS Sans SC, Alibaba PuHuiTi, Source Han Sans SC, PingFang SC, Microsoft YaHei, Noto Sans SC, sans-serif";
let jitterSeed = 1;
let jitterCursor = 0;

export function initP5ReceiptRenderer(container: HTMLElement) {
  container.classList.add("p5-receipt-host");
}

export function destroyReceiptPreviews(root: HTMLElement) {
  const hosts = root.classList.contains("p5-receipt-host")
    ? [root]
    : Array.from(root.querySelectorAll<HTMLElement>(".p5-receipt-host"));
  hosts.forEach((host) => {
    rendererMap.get(host)?.remove();
    rendererMap.delete(host);
  });
}

export function updateReceiptPreview(
  container: HTMLElement,
  data: unknown,
  receiptMode: ReceiptMode,
  roastLevel: RoastLevel,
  options: RendererOptions = {}
) {
  initP5ReceiptRenderer(container);
  rendererMap.get(container)?.remove();
  container.innerHTML = "";

  const mode = normalizeReceiptMode(receiptMode);
  const intensity = getRoastIntensity(roastLevel);
  const normalized = normalizeReceiptData(data);
  const baseHeight = getReceiptHeight(mode, roastLevel, normalized);
  const mangaBlockHeight = options.mangaImageUrl && options.mangaMode && options.mangaMode !== "none" ? 292 : 0;
  const height = baseHeight + mangaBlockHeight;

  const sketch = (p: p5) => {
    let mangaImage: p5.Image | undefined;

    p.setup = () => {
      const canvas = p.createCanvas(receiptWidth, height);
      canvas.parent(container);
      p.pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
      p.noLoop();
      p.textFont(fontStack);
      drawReceipt(p, normalized, mode, roastLevel, intensity, baseHeight, options, mangaImage);
      if (options.mangaImageUrl && options.mangaMode && options.mangaMode !== "none") {
        p.loadImage(
          options.mangaImageUrl,
          (image) => {
            mangaImage = image;
            drawReceipt(p, normalized, mode, roastLevel, intensity, baseHeight, options, mangaImage);
          },
          () => drawReceipt(p, normalized, mode, roastLevel, intensity, baseHeight, options, undefined)
        );
      }
    };
  };

  rendererMap.set(container, new p5(sketch));
  container.style.setProperty("--paper-height", `${height}px`);
  return { width: receiptWidth, height };
}

export function renderReceipt(data: unknown, receiptMode: ReceiptMode, roastLevel: RoastLevel, container: HTMLElement) {
  return updateReceiptPreview(container, data, receiptMode, roastLevel);
}

export function renderSimpleReceipt(p: p5, data: unknown, roastLevel: RoastLevel) {
  const normalized = normalizeReceiptData(data);
  renderSimpleReceiptCanvas(p, normalized, getRoastIntensity(roastLevel), getReceiptHeight("simple", roastLevel, normalized), roastLevel);
}

export function renderBigTextReceipt(p: p5, data: unknown, roastLevel: RoastLevel) {
  const normalized = normalizeReceiptData(data);
  renderBigTextReceiptCanvas(p, normalized, getRoastIntensity(roastLevel), getReceiptHeight("bigText", roastLevel, normalized), roastLevel);
}

export function renderFaceReceipt(p: p5, data: unknown, roastLevel: RoastLevel) {
  const normalized = normalizeReceiptData(data);
  renderFaceReceiptCanvas(p, normalized, getRoastIntensity(roastLevel), getReceiptHeight("face", roastLevel, normalized), roastLevel);
}

export function getRoastIntensity(roastLevel: RoastLevel): number {
  if (roastLevel === "gentle") return 0.25;
  if (roastLevel === "normal") return 0.5;
  if (roastLevel === "spicy") return 0.75;
  return 1;
}

export function getReceiptHeight(mode: "simple" | "bigText" | "face", roastLevel: RoastLevel, data: NormalizedReceiptData = normalizeReceiptData({})) {
  const intensity = getRoastIntensity(roastLevel);
  if (mode === "simple") {
    const textLoad = data.findings.join("").length + data.roast.length + data.advice.length + data.verdict.length;
    const itemCount = Math.min(8, 4 + data.findings.length + Math.round(intensity * 2));
    return Math.round(1040 + itemCount * 30 + intensity * 460 + Math.min(300, textLoad * (0.55 + intensity * 0.55)));
  }
  if (mode === "bigText") {
    const levelHeight = intensity <= 0.25 ? 720 : intensity <= 0.5 ? 930 : intensity <= 0.75 ? 1240 : 1580;
    return Math.round(levelHeight + Math.min(150, data.oneLineRoast.length * (2 + intensity * 2)));
  }
  return Math.round(870 + intensity * 380 + Math.min(160, data.shortComment.length * 3));
}

export function wrapChineseText(p: p5, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  const paragraphs = String(text || "").split(/\n+/);
  for (const paragraph of paragraphs) {
    let line = "";
    for (const char of [...paragraph]) {
      const next = line + char;
      if (line && p.textWidth(next) > maxWidth) {
        lines.push(line);
        line = char;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
  }
  return lines.length ? lines : [""];
}

export function drawDashedLine(p: p5, x1: number, y: number, x2: number, dash = 9, gap = 6) {
  p.push();
  p.stroke(0);
  p.strokeWeight(2);
  for (let x = x1; x < x2; x += dash + gap) p.line(x, y, Math.min(x + dash, x2), y);
  p.pop();
}

export function drawStamp(p: p5, text: string, x: number, y: number, size = 72, angle = -0.15) {
  p.push();
  p.translate(x, y);
  p.rotate(angle);
  p.noFill();
  p.stroke(0);
  p.strokeWeight(4);
  p.rectMode(p.CENTER);
  p.rect(0, 0, size * 1.52, size * 0.72);
  p.textAlign(p.CENTER, p.CENTER);
  p.textStyle(p.BOLD);
  p.textSize(size * 0.23);
  p.noStroke();
  p.fill(0);
  p.text(text, 0, 1);
  p.pop();
}

export function drawTag(p: p5, text: string, x: number, y: number, inverted = false, angle = 0) {
  p.push();
  p.translate(x, y);
  p.rotate(angle);
  p.textStyle(p.BOLD);
  p.textSize(13);
  const width = Math.max(48, p.textWidth(text) + 14);
  p.stroke(0);
  p.strokeWeight(2);
  p.fill(inverted ? 0 : 255);
  p.rect(0, -14, width, 22);
  p.noStroke();
  p.fill(inverted ? 255 : 0);
  p.textAlign(p.LEFT, p.CENTER);
  p.text(text, 7, -3);
  p.pop();
}

export function drawSpeedLines(p: p5, x: number, y: number, width: number, count: number, angle = -0.25) {
  p.push();
  p.stroke(0);
  p.strokeWeight(2.4);
  for (let i = 0; i < count; i += 1) {
    const yy = y + i * 9;
    const len = width * (0.42 + ((i * 37) % 50) / 100);
    p.line(x + i % 3 * 7, yy, x + len, yy + Math.sin(angle) * len * 0.18);
  }
  p.pop();
}

export function extractShortWords(data: unknown): string[] {
  const normalized = normalizeReceiptData(data);
  const pool = [
    normalized.photoType,
    normalized.atmosphere,
    normalized.aiMood,
    normalized.moodLabel,
    ...normalized.keywords,
    ...normalized.findings,
    normalized.verdict,
    normalized.headline,
    normalized.oneLineRoast
  ];
  const words = pool
    .flatMap((item) => String(item || "").split(/[，。！？、\s:：/|]+/))
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && item.length <= 6);
  return Array.from(new Set(words)).slice(0, 18);
}

export function drawTextDensityBlock(p: p5, phrases: string[], x: number, y: number, width: number, height: number, intensity: number) {
  p.push();
  p.textStyle(p.BOLD);
  p.fill(0);
  p.noStroke();
  const rows = Math.round(10 + intensity * 24);
  for (let i = 0; i < rows; i += 1) {
    const progress = i / Math.max(1, rows - 1);
    p.textSize(11 + progress * 4);
    const phrase = phrases[i % phrases.length] || "检测异常";
    const yy = y + progress * height + Math.sin(i * 1.7) * 4;
    const repeats = Math.round(1 + progress * 4);
    for (let j = 0; j < repeats; j += 1) {
      p.push();
      p.translate(x + ((i * 29 + j * 43) % width), yy + j * (3 - progress * 2));
      p.rotate((j - repeats / 2) * 0.015 * intensity);
      p.text(phrase, 0, 0);
      p.pop();
    }
  }
  p.pop();
}

function drawLogoText(p: p5, text: string, x: number, y: number, intensity: number) {
  p.push();
  p.textAlign(p.CENTER, p.TOP);
  p.textStyle(p.BOLD);
  const clean = text.toUpperCase().replace(/\s+/g, " ");
  if (intensity >= 0.75) {
    for (let i = 0; i < 4; i += 1) {
      p.fill(0, 34);
      p.text(clean, x + jitter(7, intensity), y + jitter(5, intensity));
    }
  }
  p.fill(0);
  p.text(clean, x, y);
  p.stroke(255, 170);
  p.strokeWeight(1);
  if (intensity >= 0.55) {
    for (let yy = y + 4; yy < y + 34; yy += 6) p.line(x - 128, yy + jitter(2, intensity), x + 128, yy + jitter(2, intensity));
  }
  p.pop();
}

function drawPseudoQr(p: p5, x: number, y: number, size: number, intensity: number) {
  p.push();
  p.noStroke();
  p.fill(0);
  const cell = size / 9;
  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      const finder = (row < 3 && col < 3) || (row < 3 && col > 5) || (row > 5 && col < 3);
      const on = finder || ((row * 7 + col * 11 + Math.round(intensity * 5)) % 4 === 0);
      if (on) p.rect(x + col * cell, y + row * cell, Math.ceil(cell), Math.ceil(cell));
    }
  }
  p.pop();
}

function drawDoubleRule(p: p5, x1: number, y: number, x2: number, intensity: number) {
  p.push();
  p.stroke(0);
  p.strokeWeight(1.5 + intensity * 0.5);
  p.line(x1, y, x2, y + jitter(2, intensity * 0.35));
  p.strokeWeight(0.8);
  p.line(x1, y + 4, x2, y + 4 + jitter(2, intensity * 0.35));
  p.pop();
}

function drawFineRule(p: p5, x1: number, y: number, x2: number, intensity: number) {
  p.push();
  p.stroke(0, 180);
  p.strokeWeight(1);
  if (intensity > 0.72) {
    for (let x = x1; x < x2; x += 8) p.line(x, y + jitter(3, intensity), Math.min(x + 4, x2), y + jitter(3, intensity));
  } else {
    p.line(x1, y, x2, y);
  }
  p.pop();
}

function drawReceiptText(p: p5, text: string, x: number, y: number, chaos: number) {
  const value = String(text || "");
  if (chaos <= 0.08) {
    p.text(value, x, y);
    return;
  }
  p.push();
  p.translate(x, y);
  p.rotate(jitter(0.035, chaos));
  if (chaos >= 0.5 && value.length <= 18 && !/[¥\d,]/.test(value)) {
    let cursor = 0;
    for (const char of [...value]) {
      p.push();
      p.translate(cursor, jitter(5, chaos));
      p.rotate(jitter(0.08, chaos));
      p.text(char, 0, 0);
      p.pop();
      cursor += p.textWidth(char) + jitter(1.5, chaos);
    }
  } else {
    p.text(value, 0, 0);
  }
  p.pop();
}

function receiptNumber(seed: string, length: number) {
  let value = 0;
  for (let i = 0; i < seed.length; i += 1) value = (value * 31 + seed.charCodeAt(i)) % 1000000007;
  return String(value).padStart(length, "0").slice(-length);
}

function receiptPrice(text: string, index: number, intensity: number) {
  const base = 90 + (text.length % 8) * 30 + index * 42;
  return Math.round(base + intensity * 120);
}

function scoreBar(value: number) {
  const filled = Math.max(1, Math.min(8, Math.round(value / 12.5)));
  return `${"■".repeat(filled)}${"□".repeat(8 - filled)} ${Math.round(value)}`;
}

function clipText(text: string, maxLength: number) {
  const value = String(text || "");
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function formatAmount(value: number) {
  return Math.round(value).toLocaleString("ja-JP");
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function buildMachineMeta(data: NormalizedReceiptData, mode: MachineMode, roastLevel: RoastLevel): MachineMeta {
  const now = new Date();
  const modeMap: Record<MachineMode, { label: string; code: string }> = {
    receipt: { label: "信息小票", code: "RECEIPT" },
    bigText: { label: "爆字结论", code: "BIG TYPE" },
    face: { label: "颜文字反应", code: "KAOMOJI" }
  };
  const roastMap: Record<RoastLevel, { label: string; code: string }> = {
    gentle: { label: "温柔", code: "GENTLE" },
    normal: { label: "正常", code: "NORMAL" },
    spicy: { label: "辛辣", code: "SPICY" },
    execution: { label: "处刑", code: "EXECUTION" },
    public_execution: { label: "处刑", code: "PUBLIC" }
  };
  const modeInfo = modeMap[mode];
  const roastInfo = roastMap[roastLevel] ?? roastMap.normal;
  const seed = `${data.photoType}|${data.moodLabel}|${data.roast}|${data.verdict}|${mode}|${roastLevel}`;

  return {
    title: "拍立怼",
    modeLabel: modeInfo.label,
    modeCode: modeInfo.code,
    roastLabel: roastInfo.label,
    roastCode: roastInfo.code,
    issuedAt: `${now.getFullYear()}/${pad2(now.getMonth() + 1)}/${pad2(now.getDate())} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`,
    scene: data.photoType || "生活切片",
    mood: data.aiMood || data.moodLabel || data.atmosphere || "正在分析",
    evidenceNo: `SRB-${receiptNumber(seed, 6)}`
  };
}

function metricNote(value: number) {
  if (value >= 82) return "高信号";
  if (value >= 66) return "偏高";
  if (value >= 45) return "中等";
  return "低风险";
}

function buildMachineInsight(data: NormalizedReceiptData, mode: MachineMode): MachineInsight {
  const metrics = data.scores
    .filter((score) => Number.isFinite(score.value))
    .slice(0, 3)
    .map((score) => ({
      label: score.label,
      value: Math.max(0, Math.min(100, score.value)),
      note: metricNote(score.value)
    }));
  const fallbackMetrics = [
    { label: "吐槽浓度", value: 68, note: "偏高" },
    { label: "可发程度", value: 58, note: "中等" },
    { label: "证据密度", value: 74, note: "偏高" }
  ];
  while (metrics.length < 3) metrics.push(fallbackMetrics[metrics.length]);

  const keywordPool = [
    data.photoType,
    data.atmosphere,
    data.aiMood,
    data.moodLabel,
    ...data.keywords,
    ...data.findings.flatMap((finding) => finding.split(/[，。！？、\s]+/))
  ];
  const keywords = Array.from(new Set(keywordPool.map((item) => item.trim()).filter((item) => item.length >= 2))).slice(0, 5);
  const outputPurpose: Record<MachineMode, string> = {
    receipt: "适合收藏复盘：把槽点、证据和建议留成实体纸条。",
    bigText: "适合围观传播：把最强结论放大成一眼能懂的梗。",
    face: "适合表达情绪：用颜文字记录机器被照片刺激到的反应。"
  };

  return {
    primaryFinding: data.findings[0] || data.roast || "机器还在寻找第一处证据",
    actionHint: data.advice || data.tinyAdvice || "先看证据，再决定要不要重拍。",
    verdict: data.verdict || data.oneLineRoast || "可保存，待复查",
    outputPurpose: outputPurpose[mode],
    readPath: "先看主证据，再看读数，最后按建议决定收藏/分享/补拍。",
    keywords,
    metrics
  };
}

function drawMetricBar(
  p: p5,
  metric: { label: string; value: number; note: string },
  x: number,
  y: number,
  width: number,
  intensity: number
) {
  const value = Math.max(0, Math.min(100, metric.value));
  const barY = y + 14;
  const labelWidth = 66;
  const barX = x + labelWidth;
  const barWidth = width - labelWidth - 44;

  p.noStroke();
  p.fill(0);
  p.textAlign(p.LEFT, p.TOP);
  p.textStyle(p.BOLD);
  p.textSize(9.5);
  p.text(clipText(metric.label, 6), x, y);
  p.textStyle(p.NORMAL);
  p.textSize(11);
  p.text(metric.note, x, y + 11);

  p.textAlign(p.RIGHT, p.TOP);
  p.textStyle(p.BOLD);
  p.textSize(9);
  p.text(`${Math.round(value)}`, x + width, y + 5);

  p.noFill();
  p.stroke(0);
  p.strokeWeight(1);
  p.rect(barX, barY, barWidth, 6);
  p.noStroke();
  p.fill(0);
  p.rect(barX, barY, (barWidth * value) / 100, 6);

  if (intensity >= 0.72) {
    p.stroke(0, 120);
    p.strokeWeight(0.8);
    p.line(barX + (barWidth * value) / 100, barY - 3, barX + (barWidth * value) / 100 + jitter(9, intensity), barY + 10);
  }

  return y + 28;
}

function drawInsightDashboard(
  p: p5,
  data: NormalizedReceiptData,
  mode: MachineMode,
  margin: number,
  y: number,
  width: number,
  intensity: number
) {
  const insight = buildMachineInsight(data, mode);
  const chaos = Math.max(0, intensity - 0.55);

  p.noStroke();
  p.fill(0);
  p.textAlign(p.LEFT, p.TOP);
  p.textStyle(p.BOLD);
  p.textSize(9);
  p.text("PHOTO ANALYSIS / 有效信息", margin, y);
  p.textAlign(p.RIGHT, p.TOP);
  p.text("READ FIRST", margin + width, y);
  y += 17;

  const flow = ["拍照", "理解", "纸条", "围观"];
  const flowGap = 7;
  const flowWidth = (width - flowGap * (flow.length - 1)) / flow.length;
  flow.forEach((label, index) => {
    const x = margin + index * (flowWidth + flowGap);
    p.stroke(0);
    p.strokeWeight(1);
    p.fill(index === 2 ? 0 : 255);
    p.rect(x, y, flowWidth, 18);
    p.noStroke();
    p.fill(index === 2 ? 255 : 0);
    p.textAlign(p.CENTER, p.TOP);
    p.textStyle(p.BOLD);
    p.textSize(8.5);
    p.text(label, x + flowWidth / 2, y + 4);
    if (index < flow.length - 1) {
      p.stroke(0);
      p.strokeWeight(1);
      p.line(x + flowWidth + 1, y + 9, x + flowWidth + flowGap - 2, y + 9);
    }
  });
  y += 28;

  p.stroke(0);
  p.strokeWeight(1.2);
  p.noFill();
  p.rect(margin, y, width, 46);
  p.noStroke();
  p.fill(0);
  p.rect(margin, y, 52, 46);
  p.fill(255);
  p.textAlign(p.CENTER, p.TOP);
  p.textStyle(p.BOLD);
  p.textSize(12);
  p.text("主证据", margin + 26, y + 8);
  p.textSize(8);
  p.text("EVID.", margin + 26, y + 25);
  p.fill(0);
  p.textAlign(p.LEFT, p.TOP);
  p.textStyle(p.BOLD);
  p.textSize(11);
  drawReceiptText(p, clipText(insight.primaryFinding, 29), margin + 62, y + 7, chaos * 0.28);
  p.textStyle(p.NORMAL);
  p.textSize(8.5);
  drawReceiptText(p, `结论：${clipText(insight.verdict, 24)}`, margin + 62, y + 27, chaos * 0.18);
  y += 58;

  p.textAlign(p.LEFT, p.TOP);
  p.textStyle(p.BOLD);
  p.textSize(9);
  p.text("三项读数 / SIGNALS", margin, y);
  y += 14;
  insight.metrics.forEach((metric) => {
    y = drawMetricBar(p, metric, margin, y, width, intensity);
  });

  p.noStroke();
  p.fill(0);
  p.textAlign(p.LEFT, p.TOP);
  p.textStyle(p.BOLD);
  p.textSize(9);
  p.text("行动建议", margin, y + 1);
  p.textStyle(p.NORMAL);
  drawReceiptText(p, clipText(insight.actionHint, 34), margin + 58, y + 1, chaos * 0.16);
  y += 20;

  p.textAlign(p.LEFT, p.TOP);
  p.textStyle(p.BOLD);
  p.textSize(9);
  p.text("输出用途", margin, y + 1);
  p.textStyle(p.NORMAL);
  drawReceiptText(p, clipText(insight.outputPurpose, 34), margin + 58, y + 1, chaos * 0.14);
  y += 20;

  p.textAlign(p.LEFT, p.TOP);
  p.textStyle(p.BOLD);
  p.textSize(8.2);
  p.text("阅读顺序", margin, y + 1);
  p.textStyle(p.NORMAL);
  p.textSize(8.2);
  drawReceiptText(p, clipText(insight.readPath, 36), margin + 58, y + 1, chaos * 0.1);
  y += 19;

  let chipX = margin;
  const chipY = y;
  insight.keywords.forEach((keyword) => {
    const chipWidth = Math.min(74, Math.max(36, p.textWidth(keyword) + 13));
    if (chipX + chipWidth > margin + width) return;
    p.noFill();
    p.stroke(0);
    p.strokeWeight(1);
    p.rect(chipX, chipY, chipWidth, 16);
    p.noStroke();
    p.fill(0);
    p.textAlign(p.CENTER, p.TOP);
    p.textStyle(p.BOLD);
    p.textSize(8);
    p.text(clipText(keyword, 6), chipX + chipWidth / 2, chipY + 3);
    chipX += chipWidth + 6;
  });

  return y + 28;
}

function drawMachineHeader(
  p: p5,
  data: NormalizedReceiptData,
  mode: MachineMode,
  roastLevel: RoastLevel,
  margin: number,
  y: number,
  intensity: number,
  variant: "receipt" | "poster" | "mood"
) {
  const meta = buildMachineMeta(data, mode, roastLevel);
  const width = receiptWidth - margin * 2;

  p.noStroke();
  p.fill(0);
  p.textFont(fontStack);
  p.textAlign(p.LEFT, p.TOP);
  p.textStyle(p.BOLD);
  p.textSize(13);
  p.text("SNAP ROAST BUDDY", margin, y);
  p.textAlign(p.RIGHT, p.TOP);
  p.textStyle(p.NORMAL);
  p.textSize(11);
  p.text(meta.evidenceNo, receiptWidth - margin, y);
  y += 22;

  drawDoubleRule(p, margin, y, receiptWidth - margin, intensity);
  y += 13;

  const primary = variant === "poster" ? "排版模式" : variant === "mood" ? "情绪模式" : "检测模式";
  const rows = [
    [primary, `${meta.modeLabel} / ${meta.modeCode}`],
    ["吐槽强度", `${meta.roastLabel} / ${meta.roastCode}`],
    ["生成时间", meta.issuedAt]
  ];

  p.textAlign(p.LEFT, p.TOP);
  p.textStyle(p.BOLD);
  p.textSize(12);
  rows.forEach(([label, value], index) => {
    const rowY = y + index * 19;
    p.text(label, margin, rowY);
    p.textStyle(p.NORMAL);
    p.text(clipText(value, 22), margin + 82, rowY);
    p.textStyle(p.BOLD);
    if (index < rows.length - 1) {
      p.stroke(0, 35);
      p.strokeWeight(1);
      p.line(margin, rowY + 15, margin + width, rowY + 15);
      p.noStroke();
    }
  });

  y += rows.length * 19 + 7;
  drawDoubleRule(p, margin, y, receiptWidth - margin, intensity);
  return y + 14;
}

function drawReceipt(
  p: p5,
  data: NormalizedReceiptData,
  mode: "simple" | "bigText" | "face",
  roastLevel: RoastLevel,
  intensity: number,
  baseHeight: number,
  options: RendererOptions,
  mangaImage?: p5.Image
) {
  resetJitterSeed(`${mode}:${roastLevel}:${data.title}:${data.roast}:${data.verdict}`);
  p.background(255);
  p.textFont(fontStack);
  p.noStroke();
  p.fill(0);
  drawThermalTexture(p, baseHeight + (options.mangaImageUrl && options.mangaMode !== "none" ? 292 : 0), intensity);

  let offsetY = 0;
  if (options.mangaImageUrl && options.mangaMode === "top") {
    drawMangaBlock(p, mangaImage, 0, options.mangaImageUrl);
    offsetY = 292;
  }

  p.push();
  p.translate(0, offsetY);
  if (mode === "simple") renderSimpleReceiptCanvas(p, data, intensity, baseHeight, roastLevel);
  if (mode === "bigText") renderBigTextReceiptCanvas(p, data, intensity, baseHeight, roastLevel);
  if (mode === "face") renderFaceReceiptCanvas(p, data, intensity, baseHeight, roastLevel);
  p.pop();

  if (options.mangaImageUrl && options.mangaMode === "bottom") drawMangaBlock(p, mangaImage, baseHeight, options.mangaImageUrl);
}

function renderSimpleReceiptCanvas(p: p5, data: NormalizedReceiptData, intensity: number, height: number, roastLevel: RoastLevel) {
  const margin = 22;
  const width = receiptWidth - margin * 2;
  const tags = extractShortWords(data);
  const chaos = Math.max(0, intensity - 0.55);
  let y = drawSimpleReceiptHeader(p, data, margin, width, intensity, roastLevel);

  y = drawSimpleSectionHeading(p, "今日判词", margin, y, width, intensity);
  y = drawSimpleParagraph(p, data.roast || data.oneLineRoast, margin, y, width, 18 + intensity * 2, 27, chaos * 0.2);

  y = drawSimpleSectionHeading(p, "画面主角", margin, y + 9, width, intensity);
  y = drawSimpleKeyValue(p, "主角", data.photoType, margin, y, width, chaos);
  y = drawSimpleKeyValue(p, "场景", data.atmosphere, margin, y, width, chaos);
  y = drawSimpleKeyValue(p, "氛围", data.aiMood || data.moodLabel, margin, y, width, chaos);
  y = drawSimpleKeyValue(p, "隐藏剧情", data.findings[0] || data.verdict, margin, y, width, chaos);

  y = drawSimpleSectionHeading(p, "照片诊断", margin, y + 7, width, intensity);
  y = drawSimpleDiagnosis(p, data, margin, y, width, intensity);

  y = drawSimpleSectionHeading(p, "本张照片消费明细", margin, y + 7, width, intensity);
  y = drawSimpleCharges(p, data, margin, y, width, intensity);

  p.textAlign(p.LEFT, p.TOP);
  p.textStyle(p.BOLD);
  p.textSize(16);
  p.text("合计：", margin, y + 4);
  y = drawSimpleParagraph(p, data.verdict, margin, y + 28, width, 17 + intensity, 25, chaos * 0.18);

  y = drawSimpleSectionHeading(p, "AI 建议", margin, y + 8, width, intensity);
  const adviceLines = splitAdvice(data.advice || data.tinyAdvice).slice(0, intensity >= 0.7 ? 3 : 2);
  for (const advice of adviceLines) {
    y = drawSimpleParagraph(p, `• ${advice}`, margin, y, width, 15, 23, chaos * 0.12);
  }

  y = drawSimpleSectionHeading(p, "今日标签", margin, y + 8, width, intensity);
  p.textAlign(p.LEFT, p.TOP);
  p.textStyle(p.BOLD);
  p.textSize(15);
  for (const tag of tags.slice(0, 3 + Math.round(intensity * 2))) {
    p.text(`#${clipText(tag.replace(/^#+/, ""), 10)}`, margin, y);
    y += 22;
  }

  if (intensity >= 0.68) {
    drawStamp(p, intensity >= 1 ? "事故存档" : "重点观察", 286 + jitter(8, intensity), 228 + intensity * 40, 76 + intensity * 12, -0.18);
  }
  if (intensity >= 1) {
    const blockY = Math.max(y + 24, height - 270);
    drawTextDensityBlock(p, [data.roast, data.verdict, ...tags], margin - 4, blockY, width + 8, Math.max(118, height - blockY - 94), 0.48);
  }

  drawSimpleReceiptEnding(p, margin, height, width, intensity, roastLevel);
}

function drawSimpleReceiptHeader(
  p: p5,
  data: NormalizedReceiptData,
  margin: number,
  width: number,
  intensity: number,
  roastLevel: RoastLevel
) {
  const meta = buildMachineMeta(data, "receipt", roastLevel);
  let y = 24;
  drawDashedLine(p, margin, y, receiptWidth - margin, 8, 5);
  y += 18;
  p.noStroke();
  p.fill(0);
  p.textAlign(p.CENTER, p.TOP);
  p.textStyle(p.BOLD);
  p.textSize(22);
  p.text("SNAP ROAST BUDDY", receiptWidth / 2, y);
  y += 29;
  p.textSize(15);
  p.text("PHOTO RECEIPT", receiptWidth / 2, y);
  y += 25;
  drawDashedLine(p, margin, y, receiptWidth - margin, 8, 5);
  y += 15;
  p.textAlign(p.LEFT, p.TOP);
  p.textStyle(p.NORMAL);
  p.textSize(15);
  p.text(meta.evidenceNo, margin, y);
  p.textAlign(p.RIGHT, p.TOP);
  p.text(meta.issuedAt, margin + width, y);
  return y + 26;
}

function drawSimpleSectionHeading(p: p5, label: string, margin: number, y: number, width: number, intensity: number) {
  drawDashedLine(p, margin, y, margin + width, intensity >= 0.75 ? 6 : 9, 5);
  y += 15;
  p.noStroke();
  p.fill(0);
  p.textAlign(p.LEFT, p.TOP);
  p.textStyle(p.BOLD);
  p.textSize(16);
  p.text(label, margin, y);
  return y + 27;
}

function drawSimpleParagraph(p: p5, text: string, x: number, y: number, width: number, size: number, leading: number, chaos = 0) {
  p.noStroke();
  p.fill(0);
  p.textAlign(p.LEFT, p.TOP);
  p.textStyle(p.NORMAL);
  p.textSize(size);
  return drawWrappedLine(p, text, x, y, width, size, leading, chaos) + 4;
}

function drawSimpleKeyValue(p: p5, label: string, value: string, x: number, y: number, width: number, chaos: number) {
  p.noStroke();
  p.fill(0);
  p.textAlign(p.LEFT, p.TOP);
  p.textStyle(p.BOLD);
  p.textSize(15);
  p.text(`${label}：`, x, y);
  p.textStyle(p.NORMAL);
  p.textSize(15);
  return drawWrappedLine(p, value, x + 76, y, width - 76, 15, 22, chaos * 0.12) + 2;
}

function drawSimpleDiagnosis(p: p5, data: NormalizedReceiptData, x: number, y: number, width: number, intensity: number) {
  const scores = data.scores.length
    ? data.scores.slice(0, 5)
    : [{ label: "画面可信度", value: 60 }];
  for (const score of scores) {
    const value = Math.max(0, Math.min(100, Number(score.value) || 0));
    const blocks = Math.round(value / 10);
    p.noStroke();
    p.fill(0);
    p.textAlign(p.LEFT, p.TOP);
    p.textStyle(p.NORMAL);
    p.textSize(14);
    p.text(`${clipText(score.label, 7)}：`, x, y);
    p.textStyle(p.BOLD);
    p.textSize(14);
    p.text(`${"█".repeat(blocks)}${"░".repeat(10 - blocks)}`, x + 104, y);
    p.textAlign(p.RIGHT, p.TOP);
    p.text(`${Math.round(value / 10)}/10`, x + width, y);
    y += intensity >= 0.9 ? 21 : 24;
  }
  return y + 3;
}

function drawSimpleCharges(p: p5, data: NormalizedReceiptData, x: number, y: number, width: number, intensity: number) {
  const findings = data.findings.length ? data.findings : [data.photoType, data.atmosphere];
  const rows = findings.slice(0, 3 + Math.round(intensity * 2));
  rows.forEach((finding, index) => {
    p.noStroke();
    p.fill(0);
    p.textAlign(p.LEFT, p.TOP);
    p.textStyle(p.NORMAL);
    p.textSize(15);
    p.text(`${clipText(finding, 14)}费`, x, y);
    p.textAlign(p.RIGHT, p.TOP);
    p.textStyle(p.BOLD);
    p.text(index === rows.length - 1 && intensity < 0.55 ? "-1" : `+${index + 1}`, x + width, y);
    y += 23;
  });
  return y + 6;
}

function splitAdvice(text: string) {
  const parts = String(text || "").split(/[。！？!?；;\n]+/).map((item) => item.trim()).filter(Boolean);
  return parts.length ? parts : ["靠近一点拍，减少背景干扰"];
}

function drawSimpleReceiptEnding(p: p5, margin: number, height: number, width: number, intensity: number, roastLevel: RoastLevel) {
  const y = height - 76;
  drawDashedLine(p, margin, y, margin + width, 8, 5);
  p.noStroke();
  p.fill(0);
  p.textAlign(p.CENTER, p.TOP);
  p.textStyle(p.BOLD);
  p.textSize(18);
  p.text(roastLevel === "gentle" ? "( ´ ▽ ` )ﾉ  📷" : "(╯°□°）╯︵  📷", receiptWidth / 2, y + 18);
  drawDashedLine(p, margin, y + 58, margin + width, 8, 5);
}

function drawReceiptStoreHeader(p: p5, data: NormalizedReceiptData, margin: number, intensity: number, roastLevel: RoastLevel) {
  let y = drawMachineHeader(p, data, "receipt", roastLevel, margin, 20, intensity, "receipt");
  p.textAlign(p.CENTER, p.TOP);
  p.textStyle(p.BOLD);
  p.noStroke();
  p.fill(0);

  const title = data.title.toUpperCase().replace(/\s*BUDDY$/i, "");
  p.textStyle(p.BOLD);
  p.textSize(24 + intensity * 3);
  drawLogoText(p, title, receiptWidth / 2, y, intensity);
  drawPseudoQr(p, receiptWidth - margin - 40, y + 4, 36, intensity);
  y += 36;

  p.textSize(13);
  p.textStyle(p.BOLD);
  p.text("PHOTO RECEIPT / 领 收 证", receiptWidth / 2, y);
  y += 19;

  p.textSize(12);
  p.textStyle(p.NORMAL);
  p.text(data.subtitle, receiptWidth / 2, y);
  y += 16;
  p.text(`TEL 010-${receiptNumber(data.title, 4)}-${receiptNumber(data.roast, 4)}`, receiptWidth / 2, y);
  y += 18;

  return y;
}

function drawReceiptMetaBlock(p: p5, data: NormalizedReceiptData, margin: number, y: number, width: number, intensity: number) {
  const receiptNo = receiptNumber(`${data.roast}${data.verdict}`, 6);
  const registerNo = receiptNumber(`${data.photoType}${data.aiMood}`, 13);

  p.noStroke();
  p.fill(0);
  p.textAlign(p.LEFT, p.TOP);
  p.textStyle(p.NORMAL);
  p.textSize(12);
  drawReceiptText(p, `登记编号 T${registerNo}`, margin, y, intensity * 0.2);
  p.textAlign(p.RIGHT, p.TOP);
  drawReceiptText(p, `レジ ${receiptNo.slice(0, 4)}`, margin + width, y, intensity * 0.2);
  y += 18;

  p.textAlign(p.LEFT, p.TOP);
  p.textStyle(p.BOLD);
  drawReceiptText(p, "用户要找的信息：槽点 / 证据 / 建议", margin, y, intensity * 0.18);
  p.textAlign(p.RIGHT, p.TOP);
  drawReceiptText(p, `空气: ${data.atmosphere}`, margin + width, y, intensity * 0.18);
  y += 24;

  return y;
}

function buildReceiptLineItems(data: NormalizedReceiptData, intensity: number, roastLevel: RoastLevel): ReceiptLineItem[] {
  const findings = data.findings.slice(0, intensity < 0.35 ? 2 : intensity < 0.7 ? 3 : 5);
  const rows: ReceiptLineItem[] = [
    { name: data.photoType, detail: data.atmosphere, qty: "1点", amount: 108, emphasis: true },
    ...findings.map((finding, index) => ({
      name: finding,
      detail: index % 2 === 0 ? data.aiMood : undefined,
      qty: `${index + 1}点`,
      amount: receiptPrice(finding, index, intensity)
    })),
    ...data.scores.slice(0, intensity >= 0.7 ? 3 : 2).map((score, index) => ({
      name: score.label,
      detail: scoreBar(score.value),
      qty: "対象",
      amount: Math.round(score.value) + 100 + index * 40
    }))
  ];

  if (intensity >= 0.7) {
    rows.push({ name: data.verdict, detail: "重点观察", qty: "1点", amount: 777, emphasis: true });
  }
  if (roastLevel === "execution" || roastLevel === "public_execution") {
    rows.push({ name: "公开处刑追加费", detail: data.oneLineRoast.slice(0, 18), qty: "炎上", amount: 999, emphasis: true });
  }
  return rows.slice(0, 6 + Math.round(intensity * 5));
}

function drawReceiptItemRow(p: p5, item: ReceiptLineItem, x: number, y: number, width: number, intensity: number, index: number) {
  const chaos = Math.max(0, intensity - 0.48);
  const overlap = Math.max(0, intensity - 0.72);
  const rowHeight = item.detail ? 38 - overlap * 12 : 25 - overlap * 8;
  const angle = index % 2 === 0 ? -0.012 * chaos : 0.014 * chaos;

  p.push();
  p.translate(jitter(5, chaos), jitter(5, chaos));
  p.rotate(angle);
  p.noStroke();
  p.fill(0);
  p.textAlign(p.LEFT, p.TOP);
  p.textStyle(item.emphasis ? p.BOLD : p.NORMAL);
  p.textSize(item.emphasis ? 14 : 12);
  drawReceiptText(p, clipText(item.name, intensity >= 0.75 ? 24 : 21), x, y, chaos);

  p.textAlign(p.CENTER, p.TOP);
  p.textStyle(p.NORMAL);
  p.textSize(12);
  drawReceiptText(p, item.qty, receiptWidth - 118, y + 1, chaos);

  p.textAlign(p.RIGHT, p.TOP);
  p.textStyle(item.emphasis ? p.BOLD : p.NORMAL);
  p.textSize(item.emphasis ? 14 : 12);
  drawReceiptText(p, `¥${formatAmount(item.amount)}`, x + width, y, chaos);

  if (item.detail) {
    p.textAlign(p.LEFT, p.TOP);
    p.textStyle(p.NORMAL);
    p.textSize(10);
    drawReceiptText(p, `  * ${clipText(item.detail, 26)}`, x + 8, y + 18 - overlap * 5, chaos);
  }
  p.pop();

  if (intensity >= 0.88 && index % 3 === 1) {
    p.stroke(0, 120);
    p.strokeWeight(1.2);
    p.line(x + jitter(22, intensity), y + 8, x + width - jitter(22, intensity), y + 14 + jitter(10, intensity));
  }

  return y + Math.max(18, rowHeight);
}

function drawReceiptTotalBlock(p: p5, data: NormalizedReceiptData, margin: number, y: number, width: number, intensity: number) {
  const base = data.scores.reduce((sum, score) => sum + Math.round(score.value), 0);
  const total = Math.max(311, base + data.findings.length * 180 + Math.round(intensity * 460));
  const tax = Math.round(total * 0.1);

  p.noStroke();
  p.fill(0);
  p.textAlign(p.LEFT, p.TOP);
  p.textStyle(p.BOLD);
  p.textSize(17 + intensity * 4);
  drawReceiptText(p, "合 计", margin, y, intensity * 0.25);
  p.textAlign(p.RIGHT, p.TOP);
  p.textSize(20 + intensity * 8);
  drawReceiptText(p, `¥${formatAmount(total)}`, margin + width, y - 4, intensity * 0.35);
  y += 30 - intensity * 6;

  p.textStyle(p.NORMAL);
  p.textSize(12);
  const taxRows = [
    [`(10%税 对象)`, `¥${formatAmount(total)}`],
    [`(内消费税等)`, `¥${formatAmount(tax)}`],
    [`支付方式`, intensity > 0.65 ? "AIpay Plus" : "AIpay"]
  ];
  for (const [label, value] of taxRows) {
    p.textAlign(p.LEFT, p.TOP);
    drawReceiptText(p, label, margin + 8, y, intensity * 0.16);
    p.textAlign(p.RIGHT, p.TOP);
    drawReceiptText(p, value, margin + width, y, intensity * 0.16);
    y += 17 - Math.max(0, intensity - 0.7) * 5;
  }

  return y;
}

function drawReceiptCommentBlock(
  p: p5,
  paragraphs: string[],
  margin: number,
  y: number,
  width: number,
  height: number,
  intensity: number
) {
  const chaos = Math.max(0, intensity - 0.45);
  drawDoubleRule(p, margin, y, receiptWidth - margin, intensity);
  y += 16;

  p.noStroke();
  p.fill(0);
  p.textAlign(p.LEFT, p.TOP);
  p.textStyle(p.BOLD);
  p.textSize(12);
  drawReceiptText(p, "商品の返品・交換は7日以内です", margin, y, chaos * 0.4);
  y += 18;

  for (const [index, paragraph] of paragraphs.entries()) {
    const density = y / height;
    const size = index === 0 ? 15 + intensity * 3 + density * 3 : 12 + intensity * 2;
    const leading = Math.max(11, 21 - chaos * 9 - density * intensity * 4);
    p.textStyle(index === 0 ? p.BOLD : p.NORMAL);
    p.textSize(size);
    y = drawWrappedLine(p, paragraph, margin + jitter(9, chaos), y, width, size, leading, chaos * (0.35 + density));
    y += Math.max(4, 16 - chaos * 13);
  }

  return y;
}

function drawReceiptFooter(
  p: p5,
  data: NormalizedReceiptData,
  margin: number,
  height: number,
  width: number,
  intensity: number,
  mode: MachineMode = "receipt",
  roastLevel: RoastLevel = "normal"
) {
  const meta = buildMachineMeta(data, mode, roastLevel);
  const y = height - 76;
  drawFineRule(p, margin, y - 16, receiptWidth - margin, intensity);
  drawBarcode(p, margin + 6, y, width - 12, 34 + intensity * 4, intensity);

  p.noStroke();
  p.fill(0);
  p.textSize(11);
  p.textStyle(p.BOLD);
  p.textAlign(p.CENTER, p.TOP);
  p.text("SNAP ROAST BUDDY / PHOTO RECEIPT", receiptWidth / 2, y - 34);
  p.textSize(13);
  p.textStyle(p.NORMAL);
  p.textAlign(p.LEFT, p.TOP);
  p.text(`${meta.modeCode} No.${receiptNumber(data.roast, 4)}`, margin, height - 30);
  p.textAlign(p.RIGHT, p.TOP);
  p.text(meta.evidenceNo, margin + width, height - 30);
}

function drawReceiptChaosNotes(p: p5, tags: string[], startY: number, height: number, intensity: number) {
  const count = Math.round(3 + intensity * 10);
  const maxY = Math.max(startY + 24, height - 118);
  for (let i = 0; i < count; i += 1) {
    const x = 18 + ((i * 79) % 288);
    const y = Math.min(maxY, startY + 12 + i * (19 - Math.max(0, intensity - 0.75) * 7));
    drawTag(p, tags[i % tags.length] || "异常", x, y, i % 3 === 0, (i % 2 ? -1 : 1) * 0.08 * intensity);
  }
}

function renderBigTextReceiptCanvas(p: p5, data: NormalizedReceiptData, intensity: number, height: number, roastLevel: RoastLevel) {
  const phrase = cleanBigPhrase(data.oneLineRoast || data.headline || data.roast);
  const margin = 22;
  const chaos = Math.max(0, intensity - 0.38);
  const notes = [data.topLabel, data.subHeadline, data.tinyAdvice, data.verdict, ...extractShortWords(data)].filter(Boolean);
  const title = cleanBigPhrase(data.headline || phrase).slice(0, 10);
  const subtitle = cleanSmallPhrase(data.oneLineRoast || data.roast || data.verdict);
  const roman = romanizePosterLabel(data.photoType || data.topLabel || "SNAP ROAST");
  let y = drawBigPosterHeader(p, data, title, roman, margin, intensity, roastLevel);

  if (intensity < 0.4) {
    y = drawCalmBigTextPoster(p, title, subtitle, notes, margin, y, height, intensity);
  } else if (intensity < 0.68) {
    y = drawLayeredBigTextPoster(p, title, subtitle, notes, margin, y, height, intensity);
  } else {
    y = drawWildBigTextPoster(p, title, subtitle, notes, margin, y, height, intensity, roastLevel);
  }

  y = drawBigTextFootnotes(p, notes, margin, Math.min(y + 12, height - 178), height, intensity);
  if (intensity >= 0.72) drawBigTextLooseLabels(p, notes, title, height, intensity);
  if (intensity >= 0.98) drawBigTextExecutionNoise(p, title, notes, margin, height, intensity);
  drawBigPosterFooter(p, data, phrase, margin, height, intensity, roastLevel);
}

function drawBigPosterHeader(
  p: p5,
  data: NormalizedReceiptData,
  title: string,
  roman: string,
  margin: number,
  intensity: number,
  roastLevel: RoastLevel
) {
  const chaos = Math.max(0, intensity - 0.45);
  let y = drawMachineHeader(p, data, "bigText", roastLevel, margin, 20, intensity, "poster");
  p.noStroke();
  p.fill(0);
  p.textAlign(p.LEFT, p.TOP);
  p.textStyle(p.BOLD);
  p.textSize(10);
  p.text("FOR DISPLAY ONLY, PLEASE DON'T STEAL IT", margin, y);
  y += 16;

  p.textAlign(p.CENTER, p.TOP);
  p.textSize(11);
  p.text("SNAP ROAST TYPOGRAPHIC RECEIPT", receiptWidth / 2, y);
  y += 28;

  if (intensity >= 0.6) {
    drawTitleBand(p, title, y, 48 + intensity * 10, true, jitter(0.05, chaos), intensity, roman);
    return y + 66 + intensity * 10;
  }

  drawDoubleRule(p, margin, y, receiptWidth - margin, intensity);
  y += 14;
  p.textStyle(p.BOLD);
  p.textSize(13);
  p.text(data.topLabel || "CUO WEI JIE JU", receiptWidth / 2, y);
  y += 20;
  p.textSize(11);
  p.text(roman, receiptWidth / 2, y);
  return y + 24;
}

function drawCalmBigTextPoster(
  p: p5,
  title: string,
  subtitle: string,
  notes: string[],
  margin: number,
  startY: number,
  height: number,
  intensity: number
) {
  const frameTop = startY;
  const frameHeight = Math.min(330, height - startY - 188);
  const centerX = receiptWidth / 2;

  p.push();
  p.noFill();
  p.stroke(0);
  p.strokeWeight(1.5);
  p.rect(margin, frameTop, receiptWidth - margin * 2, frameHeight);
  p.line(margin + 70, frameTop, margin + 70, frameTop + frameHeight);
  p.line(receiptWidth - margin - 64, frameTop, receiptWidth - margin - 64, frameTop + frameHeight);
  p.pop();

  drawVerticalPosterText(p, title, centerX + 10, frameTop + 30, frameHeight - 70, 74, 0);
  drawRotatedMicroText(p, subtitle, margin + 34, frameTop + frameHeight - 34, frameHeight - 70, -Math.PI / 2, 11, 0);
  drawRotatedMicroText(p, "SNAP ROAST / BIG TYPE / GUIDE SERIES", receiptWidth - margin - 30, frameTop + 34, frameHeight - 68, Math.PI / 2, 11, 0);

  p.noStroke();
  p.fill(0);
  p.textAlign(p.LEFT, p.TOP);
  p.textStyle(p.BOLD);
  p.textSize(13);
  p.text("错 位 结 局", margin + 18, frameTop + 28);
  p.textStyle(p.NORMAL);
  p.textSize(12);
  drawWrappedLine(p, notes[0] || "现场判定", margin + 18, frameTop + frameHeight - 88, 74, 12, 17, 0);

  const bandY = frameTop + frameHeight + 14;
  drawTitleBand(p, splitPosterTitle(title).join(" "), bandY, 54, false, 0, intensity, "CUO WEI JIE JU");
  return bandY + 76;
}

function drawLayeredBigTextPoster(
  p: p5,
  title: string,
  subtitle: string,
  notes: string[],
  margin: number,
  startY: number,
  height: number,
  intensity: number
) {
  const parts = splitPosterTitle(title);
  const first = parts[0] || title;
  const second = parts.slice(1).join("") || title;
  const chaos = Math.max(0.08, intensity - 0.35);
  let y = startY;

  drawTitleBand(p, first, y, 76, true, -0.035, intensity, "TYPOGRAPHIC EVIDENCE");
  y += 68;
  drawTitleBand(p, second, y, 88, false, 0.045, intensity, "ROAST WITH THE DAWN");
  y += 78;
  drawTitleBand(p, title, y, 72, true, -0.025, intensity, "DISPLAY ONLY");

  p.push();
  p.translate(receiptWidth / 2 + 8, y + 184);
  p.rotate(-0.09);
  drawVerticalPosterText(p, title, 0, -98, 214, 82, chaos);
  p.pop();

  drawWaveTextLine(p, subtitle, margin, y + 206, receiptWidth - margin * 2, 17 + intensity * 4, intensity);
  drawBigPosterMicroColumns(p, notes, margin, Math.min(height - 246, y + 242), 112, intensity);
  return y + 360;
}

function drawWildBigTextPoster(
  p: p5,
  title: string,
  subtitle: string,
  notes: string[],
  margin: number,
  startY: number,
  height: number,
  intensity: number,
  roastLevel: RoastLevel
) {
  const chaos = Math.max(0, intensity - 0.45);
  const safeBottom = height - 170;
  let y = startY;
  const parts = splitPosterTitle(title);

  drawTitleBand(p, parts[0] || title, y, 70 + intensity * 22, true, -0.025 - chaos * 0.08, intensity, "CUO WEI JIE JU");
  y += 72 - chaos * 18;
  drawTitleBand(p, parts.slice(1).join("") || subtitle.slice(0, 8), y, 84 + intensity * 28, false, 0.035 + chaos * 0.11, intensity, "ROAST WITH THE DAWN");
  y += 82 - chaos * 26;

  p.push();
  p.translate(receiptWidth / 2 + jitter(18, chaos), y + 128);
  p.rotate(-0.08 - chaos * 0.18);
  drawVerticalPosterText(p, title, 0, -126, 270 + intensity * 86, 82 + intensity * 28, chaos);
  p.pop();

  drawRotatedMicroText(p, subtitle, margin + 20, y + 298, 250, -Math.PI / 2 + chaos * 0.16, 11 + intensity * 2, chaos);
  drawRotatedMicroText(p, "UNAUTHORIZED REPRINTING OF THIS ROAST IS ENCOURAGED", receiptWidth - margin - 18, y + 32, 260, Math.PI / 2 - chaos * 0.18, 11, chaos);

  const midBand = Math.min(y + 272, safeBottom - 250);
  drawTitleBand(p, `${parts[0] || title} | ${parts[1] || "共舞"}`, midBand, 64 + intensity * 14, true, 0.02 + chaos * 0.16, intensity, "DISPLAY ONLY");
  drawWaveTextLine(p, subtitle, margin, midBand + 100, receiptWidth - margin * 2, 18 + intensity * 4, intensity);
  drawBigPosterMicroColumns(p, notes, margin, midBand + 132, 150 + intensity * 80, intensity);

  if (intensity >= 0.85 || roastLevel === "execution" || roastLevel === "public_execution") {
    const finalY = Math.min(safeBottom - 136, midBand + 270);
    drawTitleBand(p, title, finalY, 84, false, -0.035 - chaos * 0.2, intensity, "PUBLIC EXECUTION EDITION");
    drawOverprintTitle(p, title, receiptWidth / 2, finalY + 148, 68 + intensity * 20, intensity);
    return finalY + 228;
  }

  return midBand + 250;
}

function drawBigTextExecutionNoise(p: p5, title: string, notes: string[], margin: number, height: number, intensity: number) {
  const startY = height - 390;
  const phrases = [title, ...notes].filter(Boolean);
  drawTextDensityBlock(p, phrases, margin - 6, startY, receiptWidth - margin * 2 + 12, 212, intensity);
  drawOverprintTitle(p, title, receiptWidth / 2, height - 246, 82, intensity);
  drawSpeedLines(p, margin - 8, height - 188, receiptWidth - margin * 2 + 16, 12, -0.08);
}

function drawTitleBand(
  p: p5,
  text: string,
  y: number,
  bandHeight: number,
  inverted: boolean,
  angle: number,
  intensity: number,
  sideText = ""
) {
  const chaos = Math.max(0, intensity - 0.45);
  p.push();
  p.translate(receiptWidth / 2, y + bandHeight / 2);
  p.rotate(angle);
  p.rectMode(p.CENTER);
  p.noStroke();
  p.fill(inverted ? 0 : 255);
  p.rect(0, 0, receiptWidth + 24, bandHeight);
  p.stroke(0);
  p.strokeWeight(inverted ? 0 : 2);
  if (!inverted) p.rect(0, 0, receiptWidth - 44, bandHeight - 8);

  p.noStroke();
  p.fill(inverted ? 255 : 0);
  p.textAlign(p.CENTER, p.CENTER);
  p.textStyle(p.BOLD);
  const label = clipText(cleanBigPhrase(text), 10);
  const size = fitTextSize(p, label, receiptWidth - 114, bandHeight * 0.92, 28, bandHeight * 0.9);
  p.textSize(size);
  if (intensity >= 0.72) {
    for (let i = 0; i < Math.round(intensity * 4); i += 1) {
      p.fill(inverted ? 255 : 0, 34 + i * 22);
      p.text(label, jitter(8, chaos), jitter(8, chaos));
    }
    p.fill(inverted ? 255 : 0);
  }
  p.text(label, 0, 0);

  if (sideText) {
    p.textStyle(p.BOLD);
    p.textSize(11 + intensity * 2);
    p.textAlign(p.LEFT, p.CENTER);
    p.text(clipText(sideText.toUpperCase(), 25), -receiptWidth / 2 + 28, bandHeight / 2 - 12);
    p.textAlign(p.RIGHT, p.CENTER);
    p.text("2026", receiptWidth / 2 - 28, -bandHeight / 2 + 12);
  }
  p.pop();
}

function drawVerticalPosterText(p: p5, text: string, x: number, y: number, maxHeight: number, maxSize: number, chaos: number) {
  const chars = [...cleanBigPhrase(text).slice(0, 8)];
  if (!chars.length) return;
  const size = Math.min(maxSize, Math.max(34, (maxHeight / chars.length) * 0.9));
  const step = Math.min(size * 0.92, maxHeight / chars.length);

  p.push();
  p.noStroke();
  p.fill(0);
  p.textAlign(p.CENTER, p.CENTER);
  p.textStyle(p.BOLD);
  p.textSize(size);
  chars.forEach((char, index) => {
    p.push();
    p.translate(x + jitter(12, chaos), y + index * step + step / 2 + jitter(12, chaos));
    p.rotate(jitter(0.08, chaos));
    if (chaos >= 0.35) {
      p.fill(0, 46);
      p.text(char, -5, 5);
      p.fill(0);
    }
    p.text(char, 0, 0);
    p.pop();
  });
  p.pop();
}

function drawRotatedMicroText(p: p5, text: string, x: number, y: number, maxWidth: number, angle: number, size: number, chaos: number) {
  p.push();
  p.translate(x, y);
  p.rotate(angle + jitter(0.05, chaos));
  p.noStroke();
  p.fill(0);
  p.textAlign(p.LEFT, p.TOP);
  p.textStyle(p.BOLD);
  p.textSize(size);
  const lines = wrapChineseText(p, text, maxWidth);
  lines.slice(0, 5).forEach((line, index) => p.text(line, jitter(5, chaos), index * (size + 4) + jitter(4, chaos)));
  p.pop();
}

function drawBigPosterMicroColumns(p: p5, notes: string[], x: number, y: number, height: number, intensity: number) {
  const chaos = Math.max(0, intensity - 0.55);
  const columns = intensity < 0.55 ? 2 : 3;
  const colWidth = (receiptWidth - x * 2) / columns;
  p.noStroke();
  p.fill(0);
  p.textStyle(p.NORMAL);
  p.textSize(11 + intensity);
  for (let col = 0; col < columns; col += 1) {
    const note = String(notes[col % notes.length] || "现场判定");
    const lines = wrapChineseText(p, note.repeat(intensity >= 0.75 ? 2 : 1), colWidth - 10);
    p.textAlign(p.LEFT, p.TOP);
    lines.slice(0, Math.max(3, Math.floor(height / 16))).forEach((line, index) => {
      p.text(line, x + col * colWidth + jitter(4, chaos), y + index * 16 + jitter(4, chaos));
    });
  }
}

function drawWaveTextLine(p: p5, text: string, x: number, y: number, width: number, size: number, intensity: number) {
  const chars = [...cleanBigPhrase(text).slice(0, 22)];
  if (!chars.length) return;
  p.push();
  p.noStroke();
  p.fill(0);
  p.textAlign(p.CENTER, p.CENTER);
  p.textStyle(p.BOLD);
  p.textSize(size);
  chars.forEach((char, index) => {
    const progress = chars.length === 1 ? 0.5 : index / (chars.length - 1);
    const xx = x + progress * width;
    const yy = y + Math.sin(progress * Math.PI * 2) * 12 * intensity;
    p.push();
    p.translate(xx, yy);
    p.rotate(Math.cos(progress * Math.PI * 2) * 0.18 * intensity);
    p.text(char, 0, 0);
    p.pop();
  });
  p.pop();
}

function drawOverprintTitle(p: p5, text: string, x: number, y: number, size: number, intensity: number) {
  const label = cleanBigPhrase(text).slice(0, 8);
  p.push();
  p.textAlign(p.CENTER, p.CENTER);
  p.textStyle(p.BOLD);
  p.textSize(size);
  for (let i = 0; i < 5 + intensity * 4; i += 1) {
    p.fill(0, 42);
    p.text(label, x + jitter(36, intensity), y + jitter(28, intensity));
  }
  p.fill(0);
  p.text(label, x, y);
  p.pop();
}

function drawBigTextFootnotes(p: p5, notes: string[], margin: number, y: number, height: number, intensity: number) {
  const chaos = Math.max(0, intensity - 0.55);
  const bottomLimit = height - 112;
  drawFineRule(p, margin, y, receiptWidth - margin, intensity);
  y += 14;

  p.noStroke();
  p.fill(0);
  p.textAlign(p.LEFT, p.TOP);
  p.textStyle(p.BOLD);
  p.textSize(13);
  p.text("TYPOGRAPHIC EVIDENCE / DISPLAY COPY", margin, y);
  y += 16;

  p.textStyle(p.NORMAL);
  p.textSize(9 + intensity * 2);
  for (let i = 0; i < Math.min(notes.length, 4 + Math.round(intensity * 3)) && y < bottomLimit; i += 1) {
    const label = `> ${clipText(String(notes[i]), intensity >= 0.75 ? 24 : 18)}`;
    drawReceiptText(p, label, margin, y, chaos);
    p.textAlign(p.RIGHT, p.TOP);
    drawReceiptText(p, `NO.${receiptNumber(label, 3)}`, receiptWidth - margin, y, chaos);
    p.textAlign(p.LEFT, p.TOP);
    y += 16 - chaos * 4;
  }
  return y;
}

function drawBigTextLooseLabels(p: p5, notes: string[], title: string, height: number, intensity: number) {
  const labels = [title, ...notes].filter(Boolean);
  const count = Math.round(4 + intensity * 9);
  for (let i = 0; i < count; i += 1) {
    const x = 18 + (i * 71) % 292;
    const y = 154 + (i * 59) % Math.max(220, height - 360);
    drawTag(p, String(labels[i % labels.length] || "错位"), x, y, i % 3 === 0, (i % 2 ? 1 : -1) * 0.09 * intensity);
  }
}

function drawBigPosterFooter(p: p5, data: NormalizedReceiptData, phrase: string, margin: number, height: number, intensity: number, roastLevel: RoastLevel) {
  const meta = buildMachineMeta(data, "bigText", roastLevel);
  const y = height - 88;
  if (intensity >= 0.75) drawSpeedLines(p, margin, y - 54, receiptWidth - margin * 2, Math.round(5 + intensity * 8), -0.12);
  drawFineRule(p, margin, y - 12, receiptWidth - margin, intensity);
  drawBarcode(p, margin + 4, y + 4, receiptWidth - margin * 2 - 8, 30 + intensity * 6, intensity);

  p.noStroke();
  p.fill(0);
  p.textStyle(p.BOLD);
  p.textSize(16 + intensity * 4);
  p.textAlign(p.LEFT, p.TOP);
  p.text("2026", margin, height - 34);
  p.textStyle(p.NORMAL);
  p.textSize(11);
  p.textAlign(p.RIGHT, p.TOP);
  p.text(`${meta.evidenceNo} / ${receiptNumber(phrase + data.verdict, 6)}`, receiptWidth - margin, height - 30);
}

function selectKaomojiMood(pattern: string, roastLevel: RoastLevel, data: NormalizedReceiptData) {
  const text = `${pattern} ${data.moodLabel} ${data.shortComment} ${data.oneLineRoast} ${data.verdict}`;
  const pools = {
    cute: ["(｡･ω･｡)", "( ´ ▽ ` )ﾉ", "(๑˃ᴗ˂)ﻭ", "(づ￣ ³￣)づ", "(*´∀`)~♥"],
    awkward: ["(・_・;)", "(￣▽￣;)", "(；一_一)", "(¬_¬)", "(。_。)"],
    shocked: ["(⊙_⊙)", "(ﾟДﾟ;)", "Σ(°△°|||)", "(°ロ°) !", "ヽ(ﾟДﾟ)ﾉ"],
    angry: ["(╯°□°)╯", "(ಠ_ಠ)", "(#`Д´)", "ヽ(｀⌒´メ)ノ", "(ง'̀-'́)ง"],
    sad: ["(T_T)", "(；′⌒`)", "(｡•́︿•̀｡)", "(つ﹏⊂)", "(´；ω；`)"],
    speechless: ["(¬_¬)", "(-_-;)", "(눈_눈)", "(￣ー￣)", "( ͡° ͜ʖ ͡°)"],
    judgement: ["(ಠ_ಠ)", "(¬､¬)", "(눈_눈)", "(￢_￢)", "(￣ヘ￣)"],
    breakdown: ["(╯°□°)╯︵ ┻━┻", "＼(º □ º l|l)/", "Σ(°ロ°)", "(#ﾟДﾟ)", "ヽ(｀Д´)ﾉ"]
  };

  let key: keyof typeof pools = "speechless";
  if (text.includes("无语") || text.includes("加载") || text.includes("失败") || text.includes("灵魂")) key = "speechless";
  else if (pattern === "smile" || text.includes("可爱") || text.includes("甜")) key = "cute";
  else if (pattern === "angry" || text.includes("怒")) key = "angry";
  else if (pattern === "breakdown" || roastLevel === "execution" || roastLevel === "public_execution") key = "breakdown";
  else if (pattern === "judgement" || text.includes("审") || text.includes("判")) key = "judgement";
  else if (pattern === "disgust" || pattern === "speechless" || text.includes("无语")) key = "speechless";
  else if (pattern === "confused" || text.includes("震惊") || text.includes("？")) key = "shocked";
  else if (text.includes("哭") || text.includes("委屈")) key = "sad";
  else if (text.includes("尴尬")) key = "awkward";

  return {
    key,
    label: {
      cute: "KAWAII APPROVED",
      awkward: "LOADING AWKWARD",
      shocked: "SYSTEM SHOCK",
      angry: "ROAST ALERT",
      sad: "CLEARNESS LOST",
      speechless: "SPEECHLESS",
      judgement: "JUDGEMENT",
      breakdown: "PUBLIC MELTDOWN"
    }[key],
    main: pools[key][0],
    pool: pools[key]
  };
}

function drawKaomojiHeader(
  p: p5,
  data: NormalizedReceiptData,
  mood: ReturnType<typeof selectKaomojiMood>,
  margin: number,
  intensity: number,
  roastLevel: RoastLevel
) {
  let y = drawMachineHeader(p, data, "face", roastLevel, margin, 20, intensity, "mood");
  p.noStroke();
  p.fill(0);
  p.textAlign(p.CENTER, p.TOP);
  p.textStyle(p.BOLD);
  p.textSize(13);
  p.text("KAOMOJI MOOD RECEIPT / 顔文字判定", receiptWidth / 2, y);
  drawPseudoQr(p, receiptWidth - margin - 38, y - 4, 36, intensity);
  y += 28;
  drawDoubleRule(p, margin, y, receiptWidth - margin, intensity);
  y += 14;

  p.textSize(15);
  p.text(data.moodLabel || "BUDDY FACE", receiptWidth / 2, y);
  y += 18;
  p.textStyle(p.NORMAL);
  p.textSize(12);
  p.text(mood.label, receiptWidth / 2, y);
  return y + 26;
}

function drawCalmKaomojiReceipt(
  p: p5,
  data: NormalizedReceiptData,
  mood: ReturnType<typeof selectKaomojiMood>,
  words: string[],
  margin: number,
  startY: number,
  height: number,
  intensity: number
) {
  const frameHeight = Math.min(360, height - startY - 210);
  const frameWidth = receiptWidth - margin * 2;
  const centerX = receiptWidth / 2;

  p.push();
  p.noFill();
  p.stroke(0);
  p.strokeWeight(1.6);
  p.rect(margin, startY, frameWidth, frameHeight);
  p.line(margin, startY + 42, receiptWidth - margin, startY + 42);
  p.line(margin + 78, startY + 42, margin + 78, startY + frameHeight);
  p.line(receiptWidth - margin - 78, startY + 42, receiptWidth - margin - 78, startY + frameHeight);
  p.pop();

  p.noStroke();
  p.fill(0);
  p.textAlign(p.CENTER, p.CENTER);
  p.textStyle(p.BOLD);
  p.textSize(13);
  p.text("MOOD SAMPLE / DO NOT MISREAD", centerX, startY + 21);
  drawGiantKaomoji(p, mood.main, centerX, startY + frameHeight * 0.44, frameWidth - 142, 104, 0, 0);

  p.textAlign(p.LEFT, p.TOP);
  p.textStyle(p.BOLD);
  p.textSize(13);
  p.text("情绪标签", margin + 14, startY + 62);
  p.textStyle(p.NORMAL);
  p.textSize(12);
  drawWrappedLine(p, data.moodLabel || mood.label, margin + 14, startY + 84, 60, 12, 17, 0);
  p.textAlign(p.CENTER, p.TOP);
  p.textStyle(p.BOLD);
  p.textSize(12);
  p.text("颜文字样本", receiptWidth - margin - 39, startY + 62);
  mood.pool.slice(1, 4).forEach((face, index) => {
    p.textSize(14);
    p.text(face, receiptWidth - margin - 39, startY + 88 + index * 38);
  });

  const chipY = startY + frameHeight + 18;
  drawKaomojiStrip(p, mood.pool, margin, chipY, receiptWidth - margin * 2, 44, false, intensity);
  drawBigPosterMicroColumns(p, [data.shortComment, data.verdict, ...words], margin, chipY + 66, 88, intensity);
  return chipY + 172;
}

function drawWildKaomojiReceipt(
  p: p5,
  data: NormalizedReceiptData,
  mood: ReturnType<typeof selectKaomojiMood>,
  words: string[],
  margin: number,
  startY: number,
  height: number,
  intensity: number
) {
  const chaos = Math.max(0, intensity - 0.45);
  const cx = receiptWidth / 2;
  const heroY = startY + 132 + intensity * 34;

  drawKaomojiStrip(p, mood.pool, margin, startY, receiptWidth - margin * 2, 58 + intensity * 18, true, intensity);
  drawKaomojiOrbit(p, mood.pool, cx, heroY + 22, 132 + intensity * 32, 118 + intensity * 54, 14 + Math.round(intensity * 15), 13 + intensity * 7, intensity);
  drawGiantKaomoji(p, mood.main, cx + jitter(16, chaos), heroY, receiptWidth - 34, 150 + intensity * 72, -0.03 + jitter(0.12, chaos), chaos);

  const phrase = cleanSmallPhrase(data.shortComment || data.oneLineRoast);
  drawWaveKaomojiText(p, phrase, margin, heroY + 140 + intensity * 26, receiptWidth - margin * 2, 18 + intensity * 5, intensity);
  drawKaomojiFillPanel(p, mood.pool, words, margin, heroY + 188, receiptWidth - margin * 2, 116 + intensity * 92, intensity);

  if (intensity >= 0.9) {
    drawGiantKaomoji(p, mood.pool[1] || mood.main, cx + jitter(22, intensity), Math.min(height - 300, heroY + 382), receiptWidth - 62, 112, 0.1 + jitter(0.2, intensity), intensity);
  }

  return heroY + 350 + intensity * 180;
}

function drawGiantKaomoji(p: p5, face: string, x: number, y: number, maxWidth: number, maxHeight: number, angle: number, chaos: number) {
  p.push();
  p.translate(x, y);
  p.rotate(angle);
  p.textAlign(p.CENTER, p.CENTER);
  p.textStyle(p.BOLD);
  const size = fitTextSize(p, face, maxWidth, maxHeight, 22, maxHeight);
  p.textSize(size);
  if (chaos >= 0.18) {
    for (let i = 0; i < 2 + Math.round(chaos * 5); i += 1) {
      p.fill(0, 38);
      p.text(face, jitter(24, chaos), jitter(18, chaos));
    }
  }
  p.fill(0);
  p.text(face, 0, 0);
  p.pop();
}

function drawKaomojiStrip(
  p: p5,
  pool: string[],
  x: number,
  y: number,
  width: number,
  height: number,
  inverted: boolean,
  intensity: number
) {
  p.push();
  p.noStroke();
  p.fill(inverted ? 0 : 255);
  p.rect(x, y, width, height);
  p.stroke(0);
  p.strokeWeight(inverted ? 0 : 2);
  if (!inverted) p.rect(x, y, width, height);

  p.noStroke();
  p.fill(inverted ? 255 : 0);
  p.textAlign(p.CENTER, p.CENTER);
  p.textStyle(p.BOLD);
  p.textSize(14 + intensity * 7);
  const count = Math.max(3, Math.floor(width / 92));
  for (let i = 0; i < count; i += 1) {
    const face = pool[i % pool.length];
    p.text(face, x + width * ((i + 0.5) / count) + jitter(8, Math.max(0, intensity - 0.55)), y + height / 2 + jitter(6, Math.max(0, intensity - 0.55)));
  }
  p.pop();
}

function drawKaomojiOrbit(
  p: p5,
  pool: string[],
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  count: number,
  size: number,
  intensity: number
) {
  p.push();
  p.noStroke();
  p.fill(0);
  p.textStyle(p.BOLD);
  p.textAlign(p.CENTER, p.CENTER);
  p.textSize(size);
  for (let i = 0; i < count; i += 1) {
    const t = (i / count) * Math.PI * 2 + intensity * 0.3;
    p.push();
    p.translate(cx + Math.cos(t) * rx + jitter(16, intensity), cy + Math.sin(t) * ry + jitter(18, intensity));
    p.rotate(t + Math.PI / 2 + jitter(0.18, intensity));
    p.text(pool[i % pool.length], 0, 0);
    p.pop();
  }
  p.pop();
}

function drawWaveKaomojiText(p: p5, text: string, x: number, y: number, width: number, size: number, intensity: number) {
  const chars = [...text.slice(0, 28)];
  if (!chars.length) return;
  p.push();
  p.noStroke();
  p.fill(0);
  p.textAlign(p.CENTER, p.CENTER);
  p.textStyle(p.BOLD);
  p.textSize(size);
  chars.forEach((char, index) => {
    const progress = chars.length === 1 ? 0.5 : index / (chars.length - 1);
    p.push();
    p.translate(x + progress * width, y + Math.sin(progress * Math.PI * 2.2) * 16 * intensity);
    p.rotate(Math.cos(progress * Math.PI * 2.2) * 0.24 * intensity);
    p.text(char, 0, 0);
    p.pop();
  });
  p.pop();
}

function drawKaomojiFillPanel(
  p: p5,
  pool: string[],
  words: string[],
  x: number,
  y: number,
  width: number,
  height: number,
  intensity: number
) {
  p.push();
  p.noFill();
  p.stroke(0);
  p.strokeWeight(1.5);
  p.rect(x, y, width, height);
  p.noStroke();
  p.fill(0);
  p.textAlign(p.LEFT, p.TOP);
  p.textStyle(p.BOLD);
  const rowGap = Math.max(15, 24 - intensity * 7);
  const rows = Math.floor(height / rowGap);
  for (let row = 0; row < rows; row += 1) {
    p.textSize(row % 2 === 0 ? 12 + intensity * 4 : 9 + intensity * 3);
    const face = pool[row % pool.length];
    const word = words[row % Math.max(1, words.length)] || "检测";
    const line = `${face} ${word} ${face} ${word}`;
    p.push();
    p.translate(x + 8 + jitter(16, intensity), y + 8 + row * rowGap + jitter(10, intensity));
    p.rotate((row % 2 ? -1 : 1) * 0.025 * intensity);
    p.text(line, 0, 0);
    p.pop();
  }
  p.pop();
}

function drawKaomojiCommentBlock(
  p: p5,
  data: NormalizedReceiptData,
  mood: ReturnType<typeof selectKaomojiMood>,
  margin: number,
  y: number,
  height: number,
  intensity: number
) {
  const chaos = Math.max(0, intensity - 0.52);
  const bottomLimit = height - 108;
  drawDoubleRule(p, margin, y, receiptWidth - margin, intensity);
  y += 18;

  p.noStroke();
  p.fill(0);
  p.textAlign(p.LEFT, p.TOP);
  p.textStyle(p.BOLD);
  p.textSize(12);
  p.text(`判定顔文字: ${mood.main}`, margin, y);
  y += 20;
  p.textSize(13 + intensity * 2);
  y = drawWrappedLine(p, data.shortComment || data.verdict, margin, y, receiptWidth - margin * 2, 13 + intensity * 2, 20 - chaos * 5, chaos);
  y += 8;
  p.textStyle(p.NORMAL);
  p.textSize(10 + intensity * 2);
  if (y < bottomLimit) y = drawWrappedLine(p, data.verdict, margin, y, receiptWidth - margin * 2, 10 + intensity * 2, 16 - chaos * 4, chaos);
  return y;
}

function drawKaomojiLooseField(
  p: p5,
  pool: string[],
  words: string[],
  margin: number,
  startY: number,
  endY: number,
  intensity: number
) {
  const count = Math.round(5 + intensity * 12);
  for (let i = 0; i < count; i += 1) {
    const face = pool[i % pool.length];
    const label = i % 2 === 0 ? face : words[i % Math.max(1, words.length)] || face;
    const x = margin + ((i * 67) % (receiptWidth - margin * 2 - 58));
    const y = Math.min(endY - 24, startY + i * (22 - Math.max(0, intensity - 0.75) * 8));
    drawTag(p, label, x, y, i % 3 === 0, (i % 2 ? -1 : 1) * 0.1 * intensity);
  }
}

function renderFaceReceiptCanvas(p: p5, data: NormalizedReceiptData, intensity: number, height: number, roastLevel: RoastLevel) {
  const words = extractShortWords(data);
  const pattern = facePatternType(roastLevel, data);
  const mood = selectKaomojiMood(pattern, roastLevel, data);
  const margin = 22;
  const chaos = Math.max(0, intensity - 0.42);
  let y = drawKaomojiHeader(p, data, mood, margin, intensity, roastLevel);

  if (intensity < 0.52) {
    y = drawCalmKaomojiReceipt(p, data, mood, words, margin, y, height, intensity);
  } else {
    y = drawWildKaomojiReceipt(p, data, mood, words, margin, y, height, intensity);
  }

  y = drawKaomojiCommentBlock(p, data, mood, margin, Math.min(y + 10, height - 188), height, intensity);
  if (intensity >= 0.76) {
    drawKaomojiLooseField(p, mood.pool, words, margin, y + 24, height - 118, intensity);
    drawSpeedLines(p, 18, height - 132, 326, Math.round(6 + intensity * 10), -0.18);
  }
  drawReceiptFooter(p, data, margin, height, receiptWidth - margin * 2, intensity, "face", roastLevel);
}

function normalizeReceiptData(data: unknown): NormalizedReceiptData {
  const value = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const findings = arrayOfStrings(value.findings ?? value.tags ?? value.keywords);
  const keywords = arrayOfStrings(value.keywords ?? value.tags ?? value.findings);
  const scores = Array.isArray(value.scores)
    ? (value.scores as Array<{ label?: unknown; value?: unknown }>).map((score, index) => ({
        label: String(score.label ?? `SCORE ${index + 1}`),
        value: Number(score.value ?? 50)
      }))
    : [
        { label: "构图风险", value: 72 },
        { label: "吐槽浓度", value: 84 },
        { label: "可发程度", value: 58 }
      ];
  const roast = firstString(value.roast, value.oneLineRoast, value.shortComment, value.caption, value.aiComment, value.generatedComment, "这张照片很努力，努力到机器都想递一张补拍申请。");

  return {
    title: firstString(value.title, "拍立怼 Snap Roast Buddy"),
    subtitle: firstString(value.subtitle, value.topLabel, "AI 照片吐槽纸条"),
    photoType: firstString(value.photoType, value.sceneType, keywords[0], "生活切片"),
    atmosphere: firstString(value.atmosphere, value.mood, "努力营业中"),
    aiMood: firstString(value.aiMood, value.moodLabel, "正在憋笑"),
    findings: findings.length ? findings : ["主体和背景正在争夺主场", "画面诚意很足，秩序稍微掉线"],
    scores,
    roast,
    advice: firstString(value.advice, value.tinyAdvice, "建议下次先稳住镜头，再稳住全场。"),
    verdict: firstString(value.verdict, value.headline, "可发，但需要配文自救"),
    topLabel: firstString(value.topLabel, value.subtitle, ">>> 现场判定 <<<"),
    headline: firstString(value.headline, value.verdict, roast.slice(0, 8)),
    subHeadline: firstString(value.subHeadline, value.subtitle, ""),
    oneLineRoast: firstString(value.oneLineRoast, roast),
    tinyAdvice: firstString(value.tinyAdvice, value.advice, "建议：重拍也不是不行"),
    moodLabel: firstString(value.moodLabel, value.aiMood, "无语检测"),
    keywords,
    shortComment: firstString(value.shortComment, roast)
  };
}

function normalizeReceiptMode(mode: ReceiptMode): "simple" | "bigText" | "face" {
  if (mode === "bigText" || mode === "big_text") return "bigText";
  if (mode === "face" || mode === "pixel_expression" || mode === "expression") return "face";
  return "simple";
}

function drawThermalTexture(p: p5, height: number, intensity: number) {
  p.push();
  p.noStroke();
  p.fill(0, 7 + intensity * 5);
  for (let y = 4; y < height; y += 18) p.rect(0, y, receiptWidth, 1);
  p.fill(0, 10);
  for (let i = 0; i < 180 + intensity * 150; i += 1) {
    const x = (i * 47) % receiptWidth;
    const y = (i * 83) % height;
    p.rect(x, y, 1, 1);
  }
  p.stroke(0, 14);
  p.strokeWeight(1);
  for (let y = 0; y < height; y += 9) p.line(0, y, receiptWidth, y + jitter(1.4, intensity));
  p.stroke(0, 22 + intensity * 12);
  for (let x = 10; x < receiptWidth; x += 31) p.point(x, (x * 17) % height);
  p.stroke(0, 45);
  p.strokeWeight(0.8);
  p.line(8, 0, 8 + jitter(3, intensity), height);
  p.line(receiptWidth - 8, 0, receiptWidth - 8 + jitter(3, intensity), height);
  p.pop();
}

function drawMangaBlock(p: p5, image: p5.Image | undefined, y: number, imageUrl: string) {
  p.push();
  p.fill(255);
  p.stroke(0);
  p.strokeWeight(2);
  drawDashedLine(p, 18, y + 16, receiptWidth - 18, y + 16);
  p.noStroke();
  p.fill(0);
  p.textAlign(p.CENTER, p.TOP);
  p.textStyle(p.BOLD);
  p.textSize(17);
  p.text("[ BUDDY COMIC STRIP ]", receiptWidth / 2, y + 32);
  p.stroke(0);
  p.strokeWeight(2);
  p.noFill();
  p.rect(18, y + 62, receiptWidth - 36, 200);
  if (image) {
    p.image(image, 26, y + 70, receiptWidth - 52, 184);
  } else {
    p.noStroke();
    p.fill(0);
    p.textSize(13);
    p.text("漫画加载中", receiptWidth / 2, y + 148);
    if (imageUrl.startsWith("data:")) p.text("本地图片", receiptWidth / 2, y + 170);
  }
  drawDashedLine(p, 18, y + 278, receiptWidth - 18, y + 278);
  p.pop();
}

function drawSectionLabel(p: p5, text: string, x: number, y: number, intensity: number) {
  p.push();
  p.fill(0);
  p.rect(x, y - 2, 112 + intensity * 30, 20);
  p.fill(255);
  p.textAlign(p.LEFT, p.TOP);
  p.textStyle(p.BOLD);
  p.textSize(12);
  p.text(text, x + 8, y + 2);
  p.pop();
}

function drawWrappedLine(p: p5, text: string, x: number, y: number, width: number, size: number, leading: number, overlap = 0) {
  const lines = wrapChineseText(p, text, width);
  for (const [index, line] of lines.entries()) {
    p.push();
    p.translate(x + jitter(7, overlap), y + index * leading);
    p.rotate(jitter(0.04, overlap));
    p.text(line, 0, 0);
    p.pop();
  }
  return y + lines.length * leading + size * 0.2;
}

function drawBarcode(p: p5, x: number, y: number, width: number, height: number, intensity: number) {
  p.push();
  p.noStroke();
  p.fill(0);
  let cursor = x;
  while (cursor < x + width) {
    const w = 2 + ((cursor * 7) % 9) * (0.45 + intensity * 0.16);
    p.rect(cursor, y, w, height);
    cursor += w + 2 + ((cursor * 5) % 6);
  }
  p.pop();
}

function cleanBigPhrase(text: string) {
  return String(text || "").replace(/\n+/g, " ").replace(/\s+/g, "").slice(0, 24) || "离谱";
}

function cleanSmallPhrase(text: string) {
  return String(text || "").replace(/\n+/g, " ").replace(/\s+/g, " ").trim().slice(0, 56) || "现场判定";
}

function splitPosterTitle(text: string) {
  const clean = cleanBigPhrase(text);
  if (clean.length <= 4) return [clean];
  if (clean.length <= 8) return [clean.slice(0, Math.ceil(clean.length / 2)), clean.slice(Math.ceil(clean.length / 2))];
  return [clean.slice(0, 4), clean.slice(4, 8), clean.slice(8, 12)].filter(Boolean);
}

function romanizePosterLabel(text: string) {
  const words = String(text || "")
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length) return words.join(" ").toUpperCase().slice(0, 36);
  const fallback = ["TYPOGRAPHIC", "ROAST", "GUIDE", "SERIES", "DISPLAY", "COPY"];
  return fallback.slice(0, 3 + (text.length % 3)).join(" ");
}

function splitBigPhrase(text: string): string[] {
  if (text.length <= 4) return [...text];
  if (text.length <= 9) return text.match(/.{1,3}/g) ?? [text];
  return text.match(/.{1,4}/g) ?? [text];
}

function fitTextSize(p: p5, text: string, maxWidth: number, targetHeight: number, min: number, max: number) {
  let size = max;
  p.textStyle(p.BOLD);
  while (size > min) {
    p.textSize(size);
    if (p.textWidth(text) <= maxWidth && size <= targetHeight) break;
    size -= 2;
  }
  return size;
}

function facePatternType(roastLevel: RoastLevel, data: NormalizedReceiptData) {
  if (roastLevel === "gentle") return data.shortComment.includes("？") ? "confused" : "smile";
  if (roastLevel === "normal") return "speechless";
  if (roastLevel === "spicy") return data.shortComment.includes("怒") ? "angry" : "disgust";
  return data.shortComment.includes("审") ? "judgement" : "breakdown";
}

function drawTextArc(p: p5, words: string[], cx: number, cy: number, rx: number, ry: number, start: number, end: number, size: number) {
  const count = Math.max(10, Math.round((end - start) * 8));
  p.noStroke();
  p.fill(0);
  p.textStyle(p.BOLD);
  p.textSize(size);
  for (let i = 0; i < count; i += 1) {
    const t = start + (end - start) * (i / Math.max(1, count - 1));
    const word = words[i % words.length] || "检测";
    p.push();
    p.translate(cx + Math.cos(t) * rx, cy + Math.sin(t) * ry);
    p.rotate(t + Math.PI / 2);
    p.text(word, 0, 0);
    p.pop();
  }
}

function drawFaceFeature(p: p5, text: string, x: number, y: number, size: number, angle: number, intensity: number) {
  p.push();
  p.translate(x, y);
  p.rotate(angle);
  p.textAlign(p.CENTER, p.CENTER);
  p.textStyle(p.BOLD);
  p.textSize(size);
  for (let i = 0; i < Math.round(intensity * 3); i += 1) {
    p.fill(0, 56);
    p.text(text, -i * 3, i * 3);
  }
  p.fill(0);
  p.text(text, 0, 0);
  p.pop();
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function arrayOfStrings(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === "string") return value.split(/[，。！？、\n,;；]+/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function jitter(range: number, intensity: number) {
  jitterCursor += 1;
  const raw = Math.sin(jitterSeed + jitterCursor * 12.9898) * 43758.5453;
  return (raw - Math.floor(raw) - 0.5) * range * intensity;
}

function resetJitterSeed(seedText: string) {
  jitterSeed = 1;
  jitterCursor = 0;
  for (let i = 0; i < seedText.length; i += 1) {
    jitterSeed = (jitterSeed * 33 + seedText.charCodeAt(i)) % 1000003;
  }
}
