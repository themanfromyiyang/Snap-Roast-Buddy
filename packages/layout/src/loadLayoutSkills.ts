import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import type { LayoutSkill, LayoutType } from "./types.js";

const layoutTypes = new Set<LayoutType>(["receipt", "big_text", "pixel_expression"]);

export function loadLayoutSkills(skillDir: string): LayoutSkill[] {
  if (!existsSync(skillDir)) return [];

  return readdirSync(skillDir)
    .map((fileName) => join(skillDir, fileName))
    .filter((filePath) => statSync(filePath).isFile())
    .flatMap((filePath) => {
      const extension = extname(filePath).toLowerCase();
      const raw = readFileSync(filePath, "utf8");

      try {
        if (extension === ".json") return normalizeSkill(JSON.parse(raw), filePath);
        if (extension === ".md") return normalizeSkill(parseMarkdownSkill(raw), filePath);
        if (extension === ".yaml" || extension === ".yml") return normalizeSkill(parseSimpleYaml(raw), filePath);
      } catch {
        return [];
      }

      return [];
    });
}

function normalizeSkill(value: unknown, sourcePath: string): LayoutSkill[] {
  if (!isRecord(value)) return [];

  const layoutType = value.layoutType;
  if (typeof layoutType !== "string" || !layoutTypes.has(layoutType as LayoutType)) return [];

  const nameFromPath = sourcePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") ?? "layout_skill";

  return [
    {
      name: stringValue(value.name) ?? nameFromPath,
      layoutType: layoutType as LayoutType,
      description: stringValue(value.description),
      triggerKeywords: stringArray(value.triggerKeywords),
      tone: stringValue(value.tone),
      layoutRules: isRecord(value.layoutRules) ? value.layoutRules : undefined,
      contentSlots: stringArray(value.contentSlots),
      visualMotifs: stringArray(value.visualMotifs),
      examples: Array.isArray(value.examples) ? (value.examples as Array<Record<string, unknown>>) : undefined,
      sourcePath
    }
  ];
}

function parseMarkdownSkill(raw: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const title = raw.match(/^#\s*Skill:\s*(.+)$/m) ?? raw.match(/^#\s*(.+)$/m);
  if (title) result.name = title[1].trim();

  for (const key of ["layoutType", "tone", "description"]) {
    const match = raw.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
    if (match) result[key] = match[1].trim();
  }

  const triggerSection = raw.match(/triggerKeywords:\s*\[([^\]]+)\]/m);
  if (triggerSection) {
    result.triggerKeywords = triggerSection[1]
      .split(",")
      .map((item) => item.replace(/["']/g, "").trim())
      .filter(Boolean);
  }

  const motifSection = raw.match(/visualMotifs:\s*\[([^\]]+)\]/m);
  if (motifSection) {
    result.visualMotifs = motifSection[1]
      .split(",")
      .map((item) => item.replace(/["']/g, "").trim())
      .filter(Boolean);
  }

  return result;
}

function parseSimpleYaml(raw: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = raw.split(/\r?\n/);
  let currentArrayKey: string | undefined;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const arrayItem = trimmed.match(/^-\s*(.+)$/);
    if (arrayItem && currentArrayKey) {
      const existing = Array.isArray(result[currentArrayKey]) ? (result[currentArrayKey] as string[]) : [];
      existing.push(cleanScalar(arrayItem[1]));
      result[currentArrayKey] = existing;
      continue;
    }

    const pair = trimmed.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!pair) continue;

    const [, key, rawValue] = pair;
    if (!rawValue) {
      currentArrayKey = key;
      result[key] = [];
      continue;
    }

    currentArrayKey = undefined;
    result[key] = rawValue.startsWith("[") && rawValue.endsWith("]")
      ? rawValue.slice(1, -1).split(",").map(cleanScalar).filter(Boolean)
      : cleanScalar(rawValue);
  }

  return result;
}

function cleanScalar(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string");
}
