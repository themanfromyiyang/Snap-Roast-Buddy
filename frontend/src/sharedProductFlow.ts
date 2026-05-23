import type { LayoutSkill, LayoutType, RoastLevel, RoastMode } from "../../packages/layout/src/types.js";

export type TextGenerationMode = "auto" | "receipt" | "big_text" | "pixel_expression";
export type MangaMode = "none" | "top" | "bottom" | "standalone";
export type ProductRoastLevel = RoastLevel | "public_execution";

export type ProductFlowSettings = {
  generationMode: TextGenerationMode;
  roastLevel: ProductRoastLevel;
  mangaMode: MangaMode;
};

export const textGenerationModes: Array<{ value: TextGenerationMode; label: string }> = [
  { value: "auto", label: "自动" },
  { value: "receipt", label: "小票" },
  { value: "big_text", label: "爆字" },
  { value: "pixel_expression", label: "表情" }
];

export const mangaModes: Array<{ value: MangaMode; label: string }> = [
  { value: "none", label: "不使用" },
  { value: "top", label: "顶部" },
  { value: "bottom", label: "底部" },
  { value: "standalone", label: "单独" }
];

export const layoutSkills: LayoutSkill[] = [
  {
    name: "receipt_default",
    layoutType: "receipt",
    tone: "normal",
    triggerKeywords: ["自拍", "合照", "聚会", "美食", "旅行", "宠物", "杂物", "光线"],
    visualMotifs: ["今日照片审判小票", "朋友合照检测单", "AI 成片体检报告"]
  },
  {
    name: "big_text_variety_show",
    layoutType: "big_text",
    tone: "normal",
    triggerKeywords: ["糊", "裁掉", "太近", "太远", "主体不明", "背景抢戏", "离谱", "非常小"],
    visualMotifs: [">>> 紧急播报 <<<", "!!! 构图警告 !!!", ">>> 现场判定 <<<", "=== 友情事故 ==="]
  },
  {
    name: "pixel_expression_default",
    layoutType: "pixel_expression",
    tone: "normal",
    triggerKeywords: ["可爱", "尴尬", "震惊", "无语", "浪漫", "委屈", "呆", "小狗", "小猫"],
    visualMotifs: ["SNAP BUDDY MOOD", "BUDDY FACE", "AI 心情卡片"]
  },
  {
    name: "pixel_doodle_receipt_insert",
    layoutType: "pixel_doodle",
    tone: "normal",
    triggerKeywords: ["漫画", "简笔画", "白底黑线", "线稿", "抽象"],
    layoutRules: {
      title: "[ BUDDY COMIC STRIP ]",
      imageHeight: 220,
      margin: 16,
      useDashedSeparators: true,
      integrateInsideReceipt: true
    },
    visualMotifs: ["热敏纸内嵌漫画", "白底黑线小插图", "漫画回执"]
  }
];

export function mapRoastLevel(level: ProductRoastLevel): RoastLevel {
  if (level === "public_execution") return "spicy";
  return level;
}

export function modeToRoastMode(mode: TextGenerationMode, classifiedLayoutType?: LayoutType): RoastMode {
  if (mode === "auto") return classifiedLayoutType ?? "auto";
  return mode;
}

export function normalizeTextLayout(layoutType?: LayoutType): LayoutType {
  if (layoutType === "big_text" || layoutType === "pixel_expression" || layoutType === "receipt") return layoutType;
  return "receipt";
}

export function createTicketHtmlWithManga(ticketHtml: string, mangaImageUrl: string | undefined, mangaMode: MangaMode): string {
  if (!mangaImageUrl || (mangaMode !== "top" && mangaMode !== "bottom")) return ticketHtml;
  return composeTicketSvgWithManga(ticketHtml, mangaImageUrl, mangaMode);
}

export function createStandaloneMangaTicket(mangaImageUrl: string): string {
  const width = 384;
  const rules = mangaTicketRules(width);
  const height = rules.imageHeight + 106;
  const doc = document.implementation.createDocument("http://www.w3.org/2000/svg", "svg");
  const svg = doc.documentElement;
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  const rect = svgEl(doc, "rect");
  rect.setAttribute("width", "100%");
  rect.setAttribute("height", "100%");
  rect.setAttribute("fill", "#fff");
  svg.append(rect);
  svg.append(createMangaSvgGroup(doc, mangaImageUrl, 18, width, rules));
  return new XMLSerializer().serializeToString(svg);
}

export function describeMode(mode: TextGenerationMode | LayoutType): string {
  const labels: Record<string, string> = {
    auto: "自动",
    receipt: "小票",
    big_text: "爆字",
    pixel_expression: "表情",
    pixel_doodle: "漫画"
  };
  return labels[mode] ?? mode;
}

function composeTicketSvgWithManga(svgMarkup: string, imageUrl: string, placement: "top" | "bottom"): string {
  const parsed = new DOMParser().parseFromString(svgMarkup, "image/svg+xml");
  const svg = parsed.documentElement;
  if (svg.tagName.toLowerCase() !== "svg" || parsed.querySelector("parsererror")) return svgMarkup;

  const width = readSvgNumber(svg.getAttribute("width")) || readSvgViewBox(svg).width || 384;
  const originalHeight = readSvgNumber(svg.getAttribute("height")) || readSvgViewBox(svg).height || 640;
  const rules = mangaTicketRules(width);
  const blockHeight = rules.imageHeight + 82;
  const newHeight = originalHeight + blockHeight;

  svg.setAttribute("height", String(newHeight));
  svg.setAttribute("viewBox", `0 0 ${width} ${newHeight}`);

  const background = svg.querySelector("rect");
  if (background && background.getAttribute("width") === "100%") background.setAttribute("height", "100%");

  if (placement === "top") {
    Array.from(svg.children).forEach((child) => {
      if (child === background) return;
      const existingTransform = child.getAttribute("transform");
      child.setAttribute("transform", `translate(0 ${blockHeight})${existingTransform ? ` ${existingTransform}` : ""}`);
    });
    svg.insertBefore(createMangaSvgGroup(parsed, imageUrl, 16, width, rules), background?.nextSibling ?? svg.firstChild);
  } else {
    svg.append(createMangaSvgGroup(parsed, imageUrl, originalHeight - 2, width, rules));
  }

  return new XMLSerializer().serializeToString(svg);
}

type MangaTicketRules = {
  title: string;
  imageHeight: number;
  margin: number;
};

function mangaTicketRules(width: number): MangaTicketRules {
  const skill = layoutSkills.find((item) => item.layoutType === "pixel_doodle");
  const rules = (skill?.layoutRules ?? {}) as Partial<MangaTicketRules>;
  return {
    title: String(rules.title ?? "[ BUDDY COMIC STRIP ]"),
    imageHeight: Number(rules.imageHeight ?? (width >= 384 ? 220 : 200)),
    margin: Number(rules.margin ?? 16)
  };
}

function createMangaSvgGroup(doc: Document, imageUrl: string, y: number, width: number, rules: MangaTicketRules): SVGGElement {
  const group = svgEl(doc, "g") as SVGGElement;
  const x = rules.margin;
  const contentWidth = width - rules.margin * 2;
  const titleY = y + 24;
  const imageY = y + 40;

  group.append(createSvgLine(doc, x, y + 4, x + contentWidth, y + 4, true));

  const title = svgEl(doc, "text");
  title.setAttribute("x", String(width / 2));
  title.setAttribute("y", String(titleY));
  title.setAttribute("text-anchor", "middle");
  title.setAttribute("font-family", "monospace, 'Microsoft YaHei', sans-serif");
  title.setAttribute("font-size", "17");
  title.setAttribute("font-weight", "800");
  title.setAttribute("letter-spacing", "1");
  title.setAttribute("fill", "#000");
  title.textContent = rules.title;
  group.append(title);

  const imageFrame = svgEl(doc, "rect");
  imageFrame.setAttribute("x", String(x));
  imageFrame.setAttribute("y", String(imageY));
  imageFrame.setAttribute("width", String(contentWidth));
  imageFrame.setAttribute("height", String(rules.imageHeight));
  imageFrame.setAttribute("fill", "#fff");
  imageFrame.setAttribute("stroke", "#000");
  imageFrame.setAttribute("stroke-width", "1.5");
  imageFrame.setAttribute("stroke-dasharray", "7 5");
  group.append(imageFrame);

  const image = svgEl(doc, "image");
  image.setAttribute("x", String(x + 8));
  image.setAttribute("y", String(imageY + 8));
  image.setAttribute("width", String(contentWidth - 16));
  image.setAttribute("height", String(rules.imageHeight - 16));
  image.setAttribute("href", imageUrl);
  image.setAttribute("preserveAspectRatio", "xMidYMid meet");
  group.append(image);

  group.append(createSvgLine(doc, x, imageY + rules.imageHeight + 18, x + contentWidth, imageY + rules.imageHeight + 18, true));
  return group;
}

function createSvgLine(doc: Document, x1: number, y1: number, x2: number, y2: number, dashed: boolean): SVGLineElement {
  const line = svgEl(doc, "line") as SVGLineElement;
  line.setAttribute("x1", String(x1));
  line.setAttribute("y1", String(y1));
  line.setAttribute("x2", String(x2));
  line.setAttribute("y2", String(y2));
  line.setAttribute("stroke", "#000");
  line.setAttribute("stroke-width", "1.5");
  if (dashed) line.setAttribute("stroke-dasharray", "8 6");
  return line;
}

function svgEl(doc: Document, tagName: string): SVGElement {
  return doc.createElementNS("http://www.w3.org/2000/svg", tagName);
}

function readSvgNumber(value: string | null): number {
  return Number.parseFloat(value ?? "") || 0;
}

function readSvgViewBox(svg: Element): { width: number; height: number } {
  const [, , width, height] = (svg.getAttribute("viewBox") ?? "").split(/\s+/).map((value) => Number.parseFloat(value));
  return { width: width || 0, height: height || 0 };
}
