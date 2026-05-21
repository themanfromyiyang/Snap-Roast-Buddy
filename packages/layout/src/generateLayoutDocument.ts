import { pixelFaces } from "./pixelFaces.js";
import type {
  BigTextContent,
  LayoutBlock,
  LayoutDocument,
  LayoutSkill,
  LayoutType,
  PixelExpressionContent,
  ReceiptContent,
  TextBlock
} from "./types.js";
import { bar, stars, wrapText } from "./utils.js";

const margin = 16;

export function generateLayoutDocument(
  content: ReceiptContent | BigTextContent | PixelExpressionContent,
  layoutType: LayoutType,
  printWidthDots = 384,
  _skills: LayoutSkill[] = []
): LayoutDocument {
  if (layoutType === "big_text") return bigTextLayout(content as BigTextContent, printWidthDots);
  if (layoutType === "pixel_expression") return pixelExpressionLayout(content as PixelExpressionContent, printWidthDots);
  return receiptLayout(content as ReceiptContent, printWidthDots);
}

function receiptLayout(content: ReceiptContent, widthDots: number): LayoutDocument {
  const b = builder(widthDots);
  b.text(content.title, "center", 22, "bold");
  b.text(content.subtitle, "center", 18, "bold");
  b.divider("dashed");
  b.text(`照片类型：${content.photoType}`, "left", 18);
  b.text(`现场气氛：${content.atmosphere}`, "left", 18);
  b.text(`AI 心情：${content.aiMood}`, "left", 18);
  b.space(10);
  b.text("[ 主要发现 ]", "center", 18, "bold");
  for (const finding of content.findings) b.text(`- ${finding}`, "left", 17);
  b.space(8);
  b.text("[ 评分条 ]", "center", 18, "bold");
  for (const score of content.scores) {
    b.text(`${score.label}：${stars(score.value)}\n${bar(score.value, 8)}`, "left", 16);
  }
  b.space(8);
  b.text("[ 本机吐槽 ]", "center", 18, "bold");
  b.text(content.roast, "left", 18);
  b.space(8);
  b.text("[ 友善建议 ]", "center", 18, "bold");
  b.text(content.advice, "left", 18);
  b.divider("dashed");
  b.text(`结论：${content.verdict}`, "center", 19, "bold");
  b.finish();
  return b.document;
}

function bigTextLayout(content: BigTextContent, widthDots: number): LayoutDocument {
  const b = builder(widthDots);
  b.divider("thick");
  b.rotatedText({
    eyebrow: content.topLabel,
    headline: content.headline,
    subText: content.subHeadline
  });
  b.space(18);
  b.text(content.oneLineRoast, "center", 19);
  if (content.tinyAdvice) {
    b.divider("dashed");
    b.text(content.tinyAdvice, "center", 17, "bold");
  }
  b.divider("thick");
  b.finish();
  return b.document;
}

function pixelExpressionLayout(content: PixelExpressionContent, widthDots: number): LayoutDocument {
  const b = builder(widthDots);
  b.text("[ SNAP BUDDY MOOD ]", "center", 19, "bold");
  b.space(16);
  b.pixel(pixelFaces[content.faceType], 10);
  b.space(16);
  b.text(`当前表情：${content.moodLabel}`, "left", 18, "bold");
  b.text(`照片关键词：${content.keywords.join(" / ")}`, "left", 17);
  b.space(8);
  b.text("[ 本机短评 ]", "center", 18, "bold");
  b.text(content.shortComment, "center", 20);
  b.finish();
  return b.document;
}

function builder(widthDots: number) {
  const blocks: LayoutBlock[] = [];
  let y = 16;
  const contentWidth = widthDots - margin * 2;
  const document: LayoutDocument = {
    widthDots,
    background: "white",
    blocks
  };

  function pushText(
    text: string,
    align: TextBlock["align"],
    fontSize: number,
    fontWeight: TextBlock["fontWeight"] = "regular",
    letterSpacing = 0
  ) {
    const maxUnits = Math.max(12, Math.floor(contentWidth / (fontSize * 0.58)));
    const lines = text.split("\n").flatMap((line) => wrapText(line, maxUnits));
    const lineHeight = Math.round(fontSize * 1.35);
    blocks.push({
      type: "text",
      text: lines.join("\n"),
      x: margin,
      y,
      width: contentWidth,
      align,
      fontSize,
      fontWeight,
      letterSpacing,
      lineHeight
    });
    y += lines.length * lineHeight + 4;
  }

  return {
    document,
    text: pushText,
    divider(style: "solid" | "dashed" | "double" | "thick") {
      blocks.push({ type: "divider", x: margin, y, width: contentWidth, style });
      y += style === "thick" ? 18 : 14;
    },
    pixel(matrix: string[], pixelSize: number) {
      const pixelWidth = matrix[0]?.length ?? 0;
      blocks.push({
        type: "pixel_art",
        matrix,
        x: Math.round((widthDots - pixelWidth * pixelSize) / 2),
        y,
        pixelSize
      });
      y += matrix.length * pixelSize;
    },
    rotatedText(input: { eyebrow?: string; headline: string; subText?: string }) {
      const normalized = input.headline.replace(/\s+/g, "");
      const displayText = [...normalized].join(" ");
      const fontSize = input.subText ? 104 : 124;
      const headlineWidth = measureText(displayText, fontSize);
      const eyebrowWidth = input.eyebrow ? measureText(input.eyebrow, 18) : 0;
      const subTextWidth = input.subText ? measureText(input.subText, 26) : 0;
      const stripWidth = Math.max(300, Math.ceil(Math.max(headlineWidth, eyebrowWidth, subTextWidth) + 56));
      blocks.push({
        type: "rotated_text",
        text: displayText,
        eyebrow: input.eyebrow,
        subText: input.subText,
        x: margin,
        y,
        width: contentWidth,
        height: stripWidth,
        align: "center",
        fontSize,
        fontWeight: "bold",
        letterSpacing: 2
      });
      y += stripWidth;
    },
    space(height: number) {
      blocks.push({ type: "spacer", height });
      y += height;
    },
    finish() {
      this.document.heightDots = y + 16;
    }
  };
}

function measureText(text: string, fontSize: number): number {
  return [...text].reduce((sum, char) => sum + (/[\u0000-\u00ff]/.test(char) ? fontSize * 0.58 : fontSize), 0);
}
