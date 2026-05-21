import type { LayoutDocument } from "./types.js";
import { centerText, wrapText } from "./utils.js";

const previewColumns = 24;

export function renderTextPreview(layout: LayoutDocument): string {
  const lines: string[] = [];

  for (const block of layout.blocks) {
    if (block.type === "spacer") {
      lines.push("");
      continue;
    }

    if (block.type === "divider") {
      const char = block.style === "dashed" ? "-" : "=";
      lines.push(char.repeat(previewColumns));
      continue;
    }

    if (block.type === "pixel_art") {
      for (const row of block.matrix) {
        const rendered = [...row].map((cell) => (cell === "1" ? "██" : "  ")).join("");
        lines.push(centerText(rendered.trimEnd(), previewColumns));
      }
      continue;
    }

    if (block.type === "barcode_like") {
      lines.push("|||| ||| || |||| |||");
      continue;
    }

    if (block.type === "rotated_text") {
      lines.push(centerText("[ 固定高度横幅 -> 旋转 90° ]", previewColumns));
      lines.push("");
      if (block.eyebrow) lines.push(centerText(block.eyebrow, previewColumns));
      lines.push(centerText(block.text, previewColumns));
      if (block.subText) lines.push(centerText(block.subText, previewColumns));
      lines.push("");
      continue;
    }

    const maxUnits = block.fontSize >= 34 ? 12 : block.fontSize >= 20 ? 18 : previewColumns * 2;
    for (const rawLine of block.text.split("\n")) {
      for (const line of wrapText(rawLine, maxUnits)) {
        lines.push(block.align === "center" ? centerText(line, previewColumns) : line);
      }
    }
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
