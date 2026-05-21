import { analyzePhotoDescription } from "../../packages/layout/src/analyzePhotoDescription.js";
import { generateRoastLayoutWithSkills } from "../../packages/layout/src/generateRoastLayoutWithSkills.js";
import { pixelFaces } from "../../packages/layout/src/pixelFaces.js";
import type { LayoutSkill, RoastLevel, RoastMode } from "../../packages/layout/src/types.js";

type PromptEntry = {
  mode: string;
  roastLevel: string;
  systemPrompt: string;
};

type SkillFile = {
  fileName: string;
  content: string;
};

const layoutSkills: LayoutSkill[] = [
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
  }
];

const sampleDescription =
  "一个人站在景点前拍照，但是人物非常小，背景建筑很大，人物几乎看不清。";

const descriptionEl = mustQuery<HTMLTextAreaElement>("#debugDescription");
const modeEl = mustQuery<HTMLSelectElement>("#debugMode");
const roastLevelEl = mustQuery<HTMLSelectElement>("#debugRoastLevel");
const refreshButton = mustQuery<HTMLButtonElement>("#debugRefresh");
const promptSelect = mustQuery<HTMLSelectElement>("#promptSelect");
const promptView = mustQuery<HTMLPreElement>("#promptView");
const analysisView = mustQuery<HTMLPreElement>("#analysisView");
const layoutView = mustQuery<HTMLPreElement>("#layoutView");
const skillsView = mustQuery<HTMLDivElement>("#skillsView");
const facesView = mustQuery<HTMLDivElement>("#facesView");
const debugSvg = mustQuery<HTMLDivElement>("#debugSvg");

let prompts: PromptEntry[] = [];

descriptionEl.value = sampleDescription;
refreshButton.addEventListener("click", refreshDebugState);
descriptionEl.addEventListener("input", refreshDebugState);
modeEl.addEventListener("change", refreshDebugState);
roastLevelEl.addEventListener("change", refreshDebugState);
promptSelect.addEventListener("change", renderPrompt);

void boot();

async function boot() {
  await Promise.all([loadPrompts(), loadSkills()]);
  renderFaces();
  refreshDebugState();
}

async function loadPrompts() {
  const response = await fetch("/api/debug/prompts");
  const payload = (await response.json()) as { prompts: PromptEntry[] };
  prompts = payload.prompts ?? [];
  promptSelect.innerHTML = "";
  for (const prompt of prompts) {
    const option = document.createElement("option");
    option.value = `${prompt.mode}:${prompt.roastLevel}`;
    option.textContent = `${prompt.mode} / ${prompt.roastLevel}`;
    promptSelect.append(option);
  }
  renderPrompt();
}

async function loadSkills() {
  const response = await fetch("/api/debug/skills");
  const payload = (await response.json()) as { files: SkillFile[] };
  skillsView.innerHTML = "";

  for (const file of payload.files ?? []) {
    const details = document.createElement("details");
    details.open = true;
    const summary = document.createElement("summary");
    summary.textContent = file.fileName;
    const pre = document.createElement("pre");
    pre.textContent = file.content;
    details.append(summary, pre);
    skillsView.append(details);
  }
}

function renderFaces() {
  facesView.innerHTML = "";

  for (const [name, matrix] of Object.entries(pixelFaces)) {
    const item = document.createElement("div");
    item.className = "face-card";
    const title = document.createElement("strong");
    title.textContent = name;
    const art = document.createElement("pre");
    art.textContent = matrix.map((row) => [...row].map((cell) => (cell === "1" ? "██" : "  ")).join("")).join("\n");
    const raw = document.createElement("code");
    raw.textContent = JSON.stringify(matrix);
    item.append(title, art, raw);
    facesView.append(item);
  }
}

function refreshDebugState() {
  const photoDescription = descriptionEl.value;
  const analysis = analyzePhotoDescription(photoDescription);
  const result = generateRoastLayoutWithSkills(
    {
      photoDescription,
      mode: modeEl.value as RoastMode,
      roastLevel: roastLevelEl.value as RoastLevel,
      printWidthDots: 384,
      returnLayoutJson: true
    },
    layoutSkills
  );

  analysisView.textContent = JSON.stringify(analysis, null, 2);
  layoutView.textContent = JSON.stringify(
    {
      layoutType: result.layoutType,
      reason: result.reason,
      layoutJson: result.layoutJson
    },
    null,
    2
  );
  debugSvg.innerHTML = result.renderResult?.svg ?? "";

  const promptKey = `${modeEl.value}:${roastLevelEl.value}`;
  if ([...promptSelect.options].some((option) => option.value === promptKey)) {
    promptSelect.value = promptKey;
    renderPrompt();
  }
}

function renderPrompt() {
  const selected = prompts.find((prompt) => `${prompt.mode}:${prompt.roastLevel}` === promptSelect.value);
  promptView.textContent = selected?.systemPrompt ?? "Prompt 尚未加载。";
}

function mustQuery<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing DOM element: ${selector}`);
  return element;
}
