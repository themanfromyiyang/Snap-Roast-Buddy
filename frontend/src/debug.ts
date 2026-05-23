import { analyzePhotoDescription } from "../../packages/layout/src/analyzePhotoDescription.js";
import { generateRoastLayoutWithSkills } from "../../packages/layout/src/generateRoastLayoutWithSkills.js";
import { pixelFaceLibrary } from "../../packages/layout/src/pixelFaces.js";
import type { RoastLevel } from "../../packages/layout/src/types.js";
import {
  createStandaloneMangaTicket,
  createTicketHtmlWithManga,
  layoutSkills,
  modeToRoastMode,
  type MangaMode,
  type TextGenerationMode
} from "./sharedProductFlow.js";

type PromptEntry = {
  type?: string;
  mode: string;
  roastLevel: string;
  systemPrompt: string;
};

type SkillFile = {
  fileName: string;
  content: string;
};

const sampleDescription =
  "一个人站在景点前拍照，但是人物非常小，背景建筑很大，人物几乎看不清。";

const placeholderMangaSvg =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 180"><rect width="300" height="180" fill="white"/><path d="M62 128c24-62 108-74 158-25 16 16 22 36 13 48-19 22-72 15-108 12-38-3-73-10-63-35z" fill="none" stroke="black" stroke-width="7" stroke-linejoin="round"/><circle cx="128" cy="102" r="8" fill="black"/><circle cx="177" cy="98" r="8" fill="black"/><path d="M136 132c18 8 39 6 54-5" fill="none" stroke="black" stroke-width="6" stroke-linecap="round"/><path d="M85 70l-20-24M224 78l25-22" stroke="black" stroke-width="7" stroke-linecap="round"/></svg>`
  );

const descriptionEl = mustQuery<HTMLTextAreaElement>("#debugDescription");
const modeEl = mustQuery<HTMLSelectElement>("#debugMode");
const roastLevelEl = mustQuery<HTMLSelectElement>("#debugRoastLevel");
const mangaModeEl = mustQuery<HTMLSelectElement>("#debugMangaMode");
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
mangaModeEl.addEventListener("change", refreshDebugState);
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
    option.value = promptKey(prompt);
    option.textContent = `${prompt.type ?? "prompt"} / ${prompt.mode} / ${prompt.roastLevel}`;
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

  for (const [category, faces] of Object.entries(pixelFaceLibrary)) {
    for (const face of faces) {
      const item = document.createElement("div");
      item.className = "face-card";
      const title = document.createElement("strong");
      title.textContent = `${category} / ${face.label}`;
      const art = document.createElement("div");
      art.className = "pixel-face-preview";
      art.style.setProperty("--face-cols", String(face.matrix[0]?.length ?? 1));
      art.style.setProperty("--face-rows", String(face.matrix.length));
      for (const row of face.matrix) {
        for (const cell of row) {
          const pixel = document.createElement("span");
          pixel.dataset.on = cell === "1" ? "true" : "false";
          art.append(pixel);
        }
      }
      const meta = document.createElement("p");
      meta.textContent = `${face.id} · ${face.sourceHint}`;
      item.append(title, art, meta);
      facesView.append(item);
    }
  }
}

function refreshDebugState() {
  const photoDescription = descriptionEl.value;
  const analysis = analyzePhotoDescription(photoDescription);
  const mangaMode = mangaModeEl.value as MangaMode;

  if (mangaMode === "standalone") {
    analysisView.textContent = JSON.stringify(analysis, null, 2);
    layoutView.textContent = JSON.stringify(
      {
        layoutType: "pixel_doodle",
        mangaMode,
        note: "漫画单独模式不参与文字三分类，实际运行时由图像编辑模型生成图片。"
      },
      null,
      2
    );
    debugSvg.innerHTML = createStandaloneMangaTicket(placeholderMangaSvg);
    selectMatchingPrompt();
    return;
  }

  const result = generateRoastLayoutWithSkills(
    {
      photoDescription,
      mode: modeToRoastMode(modeEl.value as TextGenerationMode),
      roastLevel: roastLevelEl.value as RoastLevel,
      printWidthDots: 384,
      returnLayoutJson: true
    },
    layoutSkills
  );

  const svg = createTicketHtmlWithManga(result.renderResult?.svg ?? "", mangaMode === "none" ? undefined : placeholderMangaSvg, mangaMode);
  analysisView.textContent = JSON.stringify(analysis, null, 2);
  layoutView.textContent = JSON.stringify(
    {
      layoutType: result.layoutType,
      reason: result.reason,
      mangaMode,
      layoutJson: result.layoutJson
    },
    null,
    2
  );
  debugSvg.innerHTML = svg;
  selectMatchingPrompt();
}

function selectMatchingPrompt() {
  const promptKeyValue = `${modeEl.value}:${roastLevelEl.value}:roast`;
  if ([...promptSelect.options].some((option) => option.value === promptKeyValue)) {
    promptSelect.value = promptKeyValue;
    renderPrompt();
  }
}

function renderPrompt() {
  const selected = prompts.find((prompt) => promptKey(prompt) === promptSelect.value);
  promptView.textContent = selected?.systemPrompt ?? "Prompt 尚未加载。";
}

function promptKey(prompt: PromptEntry): string {
  return `${prompt.mode}:${prompt.roastLevel}:${prompt.type ?? "roast"}`;
}

function mustQuery<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing DOM element: ${selector}`);
  return element;
}
