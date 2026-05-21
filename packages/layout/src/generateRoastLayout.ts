import { resolve } from "node:path";
import { generateRoastLayoutWithSkills } from "./generateRoastLayoutWithSkills.js";
import { loadLayoutSkills } from "./loadLayoutSkills.js";
import type { RoastLayoutInput, RoastLayoutOutput } from "./types.js";

export function generateRoastLayout(input: RoastLayoutInput): RoastLayoutOutput {
  const skillDir = input.skillDir ?? resolve(process.cwd(), "config", "layout-skills");
  const skills = loadLayoutSkills(skillDir);
  return generateRoastLayoutWithSkills(input, skills);
}
