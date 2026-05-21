import type { LayoutDocument } from "./types.js";

export function renderSvgPreview(layout: LayoutDocument): string {
  const height = layout.heightDots ?? estimateHeight(layout);
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.widthDots}" height="${height}" viewBox="0 0 ${layout.widthDots} ${height}">`,
    `<rect width="100%" height="100%" fill="#fff"/>`
  ];

  for (const block of layout.blocks) {
    if (block.type === "divider") {
      const strokeWidth = block.style === "thick" ? 4 : block.style === "double" ? 2 : 1.5;
      const dash = block.style === "dashed" ? ` stroke-dasharray="8 6"` : "";
      parts.push(
        `<line x1="${block.x}" y1="${block.y}" x2="${block.x + block.width}" y2="${block.y}" stroke="#000" stroke-width="${strokeWidth}"${dash}/>`
      );
      if (block.style === "double") {
        parts.push(
          `<line x1="${block.x}" y1="${block.y + 5}" x2="${block.x + block.width}" y2="${block.y + 5}" stroke="#000" stroke-width="2"/>`
        );
      }
      continue;
    }

    if (block.type === "pixel_art") {
      block.matrix.forEach((row, rowIndex) => {
        [...row].forEach((cell, columnIndex) => {
          if (cell !== "1") return;
          parts.push(
            `<rect x="${block.x + columnIndex * block.pixelSize}" y="${block.y + rowIndex * block.pixelSize}" width="${block.pixelSize}" height="${block.pixelSize}" fill="#000"/>`
          );
        });
      });
      continue;
    }

    if (block.type === "barcode_like") {
      const pattern = block.pattern ?? [2, 4, 1, 3, 3, 1, 5, 2, 1, 4, 2, 2];
      let x = block.x;
      pattern.forEach((barWidth, index) => {
        if (index % 2 === 0) parts.push(`<rect x="${x}" y="${block.y}" width="${barWidth}" height="${block.height}" fill="#000"/>`);
        x += barWidth + 2;
      });
      continue;
    }

    if (block.type === "text") {
      const anchor = block.align === "center" ? "middle" : block.align === "right" ? "end" : "start";
      const x = block.align === "center" ? block.x + block.width / 2 : block.align === "right" ? block.x + block.width : block.x;
      const weight = block.fontWeight === "bold" ? 700 : 400;
      const lineHeight = block.lineHeight ?? Math.round(block.fontSize * 1.35);
      block.text.split("\n").forEach((line, index) => {
        parts.push(
          `<text x="${x}" y="${block.y + index * lineHeight + block.fontSize}" text-anchor="${anchor}" font-family="monospace, 'Microsoft YaHei', sans-serif" font-size="${block.fontSize}" font-weight="${weight}" letter-spacing="${block.letterSpacing ?? 0}" fill="#000">${escapeXml(line)}</text>`
        );
      });
    }

    if (block.type === "rotated_text") {
      const weight = block.fontWeight === "bold" ? 900 : 400;
      const textY = block.width / 2;
      parts.push(
        `<g transform="translate(${block.x + block.width} ${block.y}) rotate(90)">`,
        block.eyebrow
          ? `<text x="22" y="38" text-anchor="start" font-family="'Microsoft YaHei', 'SimHei', monospace, sans-serif" font-size="18" font-weight="700" letter-spacing="1" fill="#000">${escapeXml(block.eyebrow)}</text>`
          : "",
        `<text x="22" y="${textY}" dominant-baseline="middle" text-anchor="start" font-family="'Microsoft YaHei', 'SimHei', monospace, sans-serif" font-size="${block.fontSize}" font-weight="${weight}" letter-spacing="${block.letterSpacing ?? 0}" fill="#000">${escapeXml(block.text)}</text>`,
        block.subText
          ? `<text x="24" y="${block.width - 34}" text-anchor="start" font-family="'Microsoft YaHei', 'SimHei', monospace, sans-serif" font-size="26" font-weight="800" letter-spacing="1" fill="#000">${escapeXml(block.subText)}</text>`
          : "",
        `</g>`
      );
    }
  }

  parts.push("</svg>");
  return parts.join("");
}

function estimateHeight(layout: LayoutDocument): number {
  return layout.blocks.reduce((height, block) => {
    if ("y" in block) return Math.max(height, block.y + ("height" in block ? block.height : 40));
    return height + block.height;
  }, 64);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
