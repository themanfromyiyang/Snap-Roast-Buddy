import type { LayoutSkill, LayoutType, PhotoAnalysis, RoastLevel } from "./types.js";

export const clamp = (value: number, min = 0, max = 100): number =>
  Math.max(min, Math.min(max, value));

export const unique = <T>(items: T[]): T[] => [...new Set(items)];

export function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

export function matchKeywords(text: string, keywords: string[]): string[] {
  return keywords.filter((keyword) => text.includes(keyword));
}

export function bar(value: number, slots = 10): string {
  const filled = Math.round((clamp(value) / 100) * slots);
  return `${"█".repeat(filled)}${"░".repeat(slots - filled)} ${clamp(value)}%`;
}

export function stars(value: number): string {
  const filled = Math.max(1, Math.round(clamp(value) / 20));
  return `${"★".repeat(filled)}${"☆".repeat(5 - filled)}`;
}

export function characterSpace(text: string): string {
  return [...text].join(" ");
}

export function choose<T>(items: T[], seedText: string): T {
  const seed = [...seedText].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return items[seed % items.length];
}

export function selectSkill(
  skills: LayoutSkill[],
  layoutType: LayoutType,
  analysis: PhotoAnalysis,
  roastLevel: RoastLevel
): LayoutSkill | undefined {
  const haystack = [
    analysis.sceneType,
    analysis.mood,
    ...analysis.subjects,
    ...analysis.flaws,
    ...analysis.funnyPoints,
    ...analysis.visualKeywords,
    ...analysis.photoQualityIssues
  ].join(" ");

  return skills
    .filter((skill) => skill.layoutType === layoutType)
    .map((skill) => {
      const keywordHits = skill.triggerKeywords?.filter((keyword) => haystack.includes(keyword)).length ?? 0;
      const toneBonus = skill.tone === roastLevel ? 2 : 0;
      return { skill, score: keywordHits * 3 + toneBonus };
    })
    .sort((a, b) => b.score - a.score)[0]?.skill;
}

export function wrapText(text: string, maxUnits: number): string[] {
  const lines: string[] = [];
  let current = "";
  let width = 0;

  for (const char of text) {
    if (char === "\n") {
      lines.push(current);
      current = "";
      width = 0;
      continue;
    }

    const charWidth = /[\u0000-\u00ff]/.test(char) ? 1 : 2;
    if (width + charWidth > maxUnits && current.length > 0) {
      lines.push(current);
      current = char;
      width = charWidth;
    } else {
      current += char;
      width += charWidth;
    }
  }

  if (current) lines.push(current);
  return lines;
}

export function centerText(text: string, width: number): string {
  const visualWidth = [...text].reduce((sum, char) => sum + (/[\u0000-\u00ff]/.test(char) ? 1 : 2), 0);
  const left = Math.max(0, Math.floor((width - visualWidth) / 2));
  return `${" ".repeat(left)}${text}`;
}
