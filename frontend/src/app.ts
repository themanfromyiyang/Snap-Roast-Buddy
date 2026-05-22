import { generateRoastLayoutWithSkills } from "../../packages/layout/src/generateRoastLayoutWithSkills.js";
import type { LayoutSkill, LayoutType, RoastLevel, RoastMode } from "../../packages/layout/src/types.js";

type RoastApiResponse = {
  aiComment?: string;
  enhancedDescription?: string;
  error?: string;
  detail?: string;
};

type ImageAnalysisResponse = {
  photoDescription?: string;
  error?: string;
  detail?: string;
};

type ClassificationResponse = {
  layoutType?: LayoutType;
  reason?: string;
  confidence?: number;
  error?: string;
  detail?: string;
};

type DoodleResponse = {
  imageUrl?: string;
  imageBase64?: string;
  prompt?: string;
  error?: string;
  detail?: string;
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
  },
  {
    name: "pixel_doodle_default",
    layoutType: "pixel_doodle",
    tone: "normal",
    triggerKeywords: ["可爱", "宠物", "小狗", "小猫", "玩具", "物品", "贴纸", "简笔画"],
    visualMotifs: ["黑白二值线稿", "可爱漫画贴纸", "热敏纸插画"]
  }
];

const textExamples = [
  {
    name: "朋友聚会自拍",
    text: "一张朋友聚会自拍，四个人挤在画面里，右边的人被裁掉半张脸，中间的人表情很夸张，背景有很多杂物，光线偏暗。"
  },
  {
    name: "景点主体失踪",
    text: "一个人站在景点前拍照，但是人物非常小，背景建筑很大，人物几乎看不清。"
  },
  {
    name: "委屈小狗",
    text: "一张小狗趴在地上的照片，它看着镜头，表情很委屈，画面很可爱。"
  },
  {
    name: "糊掉的夜拍",
    text: "一张夜晚街边自拍，灯光很暗，画面有点糊，朋友的手正在挥动，背景霓虹比人还抢眼。"
  },
  {
    name: "尴尬表情包",
    text: "一张室内生活照，一个人看着镜头表情很呆，像突然被点名，桌面有零食袋和杯子，气氛有点尴尬。"
  }
];

const imageExamples = [
  {
    name: "示例图 A",
    url: "https://sf-maas-uat-prod.oss-cn-shanghai.aliyuncs.com/suggestion/lbygavkzjykewmmpnzfutkvedlowunms.png"
  },
  {
    name: "小狗",
    url: "https://images.unsplash.com/photo-1517849845537-4d257902454a?auto=format&fit=crop&w=900&q=80"
  },
  {
    name: "旅行打卡",
    url: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80"
  }
];

const input = mustQuery<HTMLTextAreaElement>("#photoDescription");
const mode = mustQuery<HTMLSelectElement>("#mode");
const roastLevel = mustQuery<HTMLSelectElement>("#roastLevel");
const imageUpload = mustQuery<HTMLInputElement>("#imageUpload");
const imageExamplesEl = mustQuery<HTMLDivElement>("#imageExamples");
const imagePreview = mustQuery<HTMLImageElement>("#imagePreview");
const analyzeImageButton = mustQuery<HTMLButtonElement>("#analyzeImageButton");
const classifyButton = mustQuery<HTMLButtonElement>("#classifyButton");
const generateButton = mustQuery<HTMLButtonElement>("#generateButton");
const examplesEl = mustQuery<HTMLDivElement>("#examples");
const receiptPaper = mustQuery<HTMLDivElement>("#receiptPaper");
const doodleStage = mustQuery<HTMLDivElement>("#doodleStage");
const doodleImage = mustQuery<HTMLImageElement>("#doodleImage");
const doodleStatus = mustQuery<HTMLParagraphElement>("#doodleStatus");
const textPreview = mustQuery<HTMLPreElement>("#textPreview");
const layoutType = mustQuery<HTMLSpanElement>("#layoutType");
const reason = mustQuery<HTMLParagraphElement>("#reason");
const heightReadout = mustQuery<HTMLSpanElement>("#heightReadout");
const apiStatus = mustQuery<HTMLParagraphElement>("#apiStatus");
const aiCommentEl = mustQuery<HTMLParagraphElement>("#aiComment");
const imageStatus = mustQuery<HTMLParagraphElement>("#imageStatus");
const classificationType = mustQuery<HTMLSpanElement>("#classificationType");
const classificationConfidence = mustQuery<HTMLSpanElement>("#classificationConfidence");
const classificationReason = mustQuery<HTMLParagraphElement>("#classificationReason");
const classificationStatus = mustQuery<HTMLParagraphElement>("#classificationStatus");

let inputUpdateTimer = 0;
let selectedImageUrl = "";
let selectedImageDataUrl = "";
let latestAiComment = "";
let latestEnhancedDescription = "";
let classifiedLayoutType: LayoutType | undefined;

input.value = textExamples[0].text;
selectedImageUrl = imageExamples[0].url;
imagePreview.src = selectedImageUrl;

for (const example of textExamples) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "example-button";
  button.textContent = example.name;
  button.addEventListener("click", () => {
    input.value = example.text;
    resetGeneratedState();
    renderLocal();
  });
  examplesEl.append(button);
}

for (const example of imageExamples) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "image-example-button";
  button.innerHTML = `<img src="${example.url}" alt="${example.name}" /><span>${example.name}</span>`;
  button.addEventListener("click", () => {
    selectedImageUrl = example.url;
    selectedImageDataUrl = "";
    imagePreview.src = example.url;
    resetGeneratedState();
  });
  imageExamplesEl.append(button);
}

imageUpload.addEventListener("change", async () => {
  const file = imageUpload.files?.[0];
  if (!file) return;
  selectedImageDataUrl = await fileToDataUrl(file);
  selectedImageUrl = "";
  imagePreview.src = selectedImageDataUrl;
  resetGeneratedState();
});

analyzeImageButton.addEventListener("click", analyzeImage);
classifyButton.addEventListener("click", classifyDescription);
generateButton.addEventListener("click", generateWithApi);
input.addEventListener("input", () => {
  resetGeneratedState();
  window.clearTimeout(inputUpdateTimer);
  inputUpdateTimer = window.setTimeout(renderLocal, 220);
});
mode.addEventListener("change", () => {
  classifiedLayoutType = undefined;
  renderClassification();
  renderLocal();
  if (mode.value === "pixel_doodle") {
    setStepStatus(classificationStatus, "像素简笔画会直接从图片生成，不需要文本分类。", "ready");
  }
});
roastLevel.addEventListener("change", renderLocal);

async function analyzeImage() {
  const imagePayload = selectedImageDataUrl || selectedImageUrl;
  if (!imagePayload) {
    setStepStatus(imageStatus, "请先上传图片或选择示例图片。", "error");
    return;
  }

  setBusy(analyzeImageButton, true, "正在分析图片...");
  setStepStatus(imageStatus, "正在调用视觉模型分析图片，请稍等。", "loading");
  setStatus("步骤 1：正在调用视觉模型分析图片。", "loading");

  try {
    const response = await fetch("/api/analyze-image", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(selectedImageDataUrl ? { imageDataUrl: selectedImageDataUrl } : { imageUrl: selectedImageUrl })
    });
    const payload = (await response.json()) as ImageAnalysisResponse;
    if (!response.ok || payload.error) throw new Error(formatApiError(payload, "图片分析失败。"));

    input.value = payload.photoDescription?.trim() || input.value;
    resetGeneratedState();
    setStepStatus(imageStatus, "图片分析完成，描述已填入文本框。", "ready");
    setStepStatus(classificationStatus, "可以进行三分类。", "ready");
    setStatus("步骤 1 完成：已得到图片描述，可以继续三分类。", "ready");
    renderLocal();
  } catch (error) {
    const message = error instanceof Error ? error.message : "图片分析失败。";
    setStepStatus(imageStatus, message, "error");
    setStatus(message, "error");
  } finally {
    setBusy(analyzeImageButton, false, "分析图片内容");
  }
}

async function classifyDescription() {
  if (mode.value === "pixel_doodle") {
    classifiedLayoutType = "pixel_doodle";
    classificationReason.textContent = "像素简笔画是图片到图片的直接生成模式，不需要先转文本或分类。";
    classificationConfidence.textContent = "direct";
    setStepStatus(classificationStatus, "已选择图片直出模式。", "ready");
    renderClassification();
    renderLocal();
    return classifiedLayoutType;
  }

  const photoDescription = input.value.trim();
  if (!photoDescription) {
    setStepStatus(classificationStatus, "请先输入或分析得到图片描述。", "error");
    return;
  }

  if (mode.value !== "auto") {
    classifiedLayoutType = mode.value as LayoutType;
    classificationReason.textContent = "当前为强制模式，直接使用用户选择的排版。";
    classificationConfidence.textContent = "manual";
    setStepStatus(classificationStatus, "已使用强制模式。", "ready");
    renderClassification();
    renderLocal();
    return classifiedLayoutType;
  }

  setBusy(classifyButton, true, "正在分类...");
  setStepStatus(classificationStatus, "正在调用模型进行三分类。", "loading");
  setStatus("步骤 2：正在把描述分类到三种文字排版。", "loading");

  try {
    const response = await fetch("/api/classify-layout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ photoDescription })
    });
    const payload = (await response.json()) as ClassificationResponse;
    if (!response.ok || payload.error || !payload.layoutType) {
      throw new Error(formatApiError(payload, "排版分类失败。"));
    }

    classifiedLayoutType = payload.layoutType;
    classificationReason.textContent = payload.reason || "已完成分类。";
    classificationConfidence.textContent = typeof payload.confidence === "number" ? payload.confidence.toFixed(2) : "-";
    setStepStatus(classificationStatus, "三分类完成。", "ready");
    setStatus("步骤 2 完成：已选择排版类型。", "ready");
    renderClassification();
    renderLocal();
    return classifiedLayoutType;
  } catch (error) {
    classifiedLayoutType = undefined;
    const message = error instanceof Error ? error.message : "排版分类失败。";
    classificationReason.textContent = message;
    classificationConfidence.textContent = "-";
    setStepStatus(classificationStatus, message, "error");
    setStatus("分类失败，当前回退本地自动判断。", "error");
    renderClassification();
    renderLocal();
    return undefined;
  } finally {
    setBusy(classifyButton, false, "进行三分类");
  }
}

async function generateWithApi() {
  if (mode.value === "pixel_doodle" || classifiedLayoutType === "pixel_doodle") {
    setBusy(generateButton, true, "正在生成线稿...");
    setStatus("正在直接从图片生成黑白二值漫画线稿。", "loading");
    await generateDoodle();
    setBusy(generateButton, false, "生成 AI 小票");
    return;
  }

  const photoDescription = input.value.trim();
  if (!photoDescription) {
    setStatus("请先输入照片描述。", "error");
    return;
  }

  setBusy(generateButton, true, "AI 正在吐槽...");
  setStatus("步骤 3：正在生成评价并排版。", "loading");

  const selectedLayout = classifiedLayoutType ?? (await classifyDescription());
  const generationMode = selectedLayout ?? (mode.value as RoastMode);

  try {
    const response = await fetch("/api/roast", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        photoDescription,
        mode: generationMode,
        roastLevel: roastLevel.value
      })
    });

    const payload = (await response.json()) as RoastApiResponse;
    if (!response.ok || payload.error) throw new Error(formatApiError(payload, "API request failed."));

    latestAiComment = payload.aiComment?.trim() ?? "";
    latestEnhancedDescription = payload.enhancedDescription?.trim() ?? "";
    aiCommentEl.textContent = latestAiComment || "模型没有返回评价，已使用本地模板。";
    setStatus("步骤 3 完成：AI 评价已生成，并完成小票排版。", "ready");
    renderLocal();
  } catch (error) {
    latestAiComment = "";
    latestEnhancedDescription = "";
    aiCommentEl.textContent = error instanceof Error ? error.message : "API 调用失败，已回退本地模板。";
    setStatus("API 不可用，当前显示本地模板结果。", "error");
    renderLocal();
  } finally {
    setBusy(generateButton, false, "生成 AI 小票");
  }
}

async function generateDoodle() {
  const imagePayload = selectedImageDataUrl || selectedImageUrl;
  if (!imagePayload) {
    const message = "像素简笔画需要先上传图片或选择示例图片。";
    setStatus(message, "error");
    doodleStatus.textContent = message;
    return;
  }

  showDoodlePreview(true);
  doodleStatus.textContent = "正在调用图像编辑模型生成黑白二值漫画线稿...";

  try {
    const response = await fetch("/api/generate-doodle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...(selectedImageDataUrl ? { imageDataUrl: selectedImageDataUrl } : { imageUrl: selectedImageUrl })
      })
    });
    const payload = (await response.json()) as DoodleResponse;
    if (!response.ok || payload.error) throw new Error(formatApiError(payload, "像素简笔画生成失败。"));

    const imageSrc = payload.imageUrl || (payload.imageBase64 ? `data:image/png;base64,${payload.imageBase64}` : "");
    if (!imageSrc) throw new Error("图像编辑模型没有返回图片。");

    doodleImage.src = imageSrc;
    doodleStatus.textContent = "黑白二值漫画线稿已生成。";
    latestAiComment = "本机已把这张照片改造成适合热敏纸的黑白漫画线稿。";
    aiCommentEl.textContent = latestAiComment;
    setStatus("步骤 3 完成：黑白二值漫画线稿已生成。", "ready");
  } catch (error) {
    const message = error instanceof Error ? error.message : "像素简笔画生成失败。";
    doodleStatus.textContent = message;
    setStatus(message, "error");
  }
}

function renderLocal() {
  const sourceDescription = latestEnhancedDescription || input.value;
  if (getLayoutMode() === "pixel_doodle") {
    showDoodlePreview(true);
    layoutType.textContent = "pixel_doodle";
    reason.textContent = "当前模式为像素简笔画，将直接从图片生成白底黑线的二值漫画线稿。";
    heightReadout.textContent = "image edit";
    textPreview.textContent = "[ pixel_doodle ]\n调用图像编辑模型生成白底黑线的二值漫画线稿。";
    return;
  }

  showDoodlePreview(false);
  const result = generateRoastLayoutWithSkills(
    {
      photoDescription: sourceDescription,
      generatedComment: latestAiComment,
      mode: getLayoutMode(),
      roastLevel: roastLevel.value as RoastLevel,
      language: "zh",
      printWidthDots: 384,
      returnLayoutJson: true
    },
    layoutSkills
  );

  receiptPaper.innerHTML = result.renderResult?.svg ?? "";
  receiptPaper.style.setProperty("--paper-height", `${result.layoutJson.heightDots ?? 0}px`);
  textPreview.textContent = result.textPreview;
  layoutType.textContent = result.layoutType;
  reason.textContent = result.reason;
  heightReadout.textContent = `${result.layoutJson.widthDots}px x ${result.layoutJson.heightDots ?? "auto"}px`;
}

function getLayoutMode(): RoastMode {
  if (mode.value !== "auto") return mode.value as LayoutType;
  return classifiedLayoutType ?? "auto";
}

function resetGeneratedState() {
  latestAiComment = "";
  latestEnhancedDescription = "";
  classifiedLayoutType = undefined;
  aiCommentEl.textContent = "尚未调用 API，当前为本地模板预览。";
  classificationReason.textContent = "尚未分类。";
  classificationConfidence.textContent = "-";
  setStepStatus(classificationStatus, "等待三分类。", "ready");
  renderClassification();
}

function renderClassification() {
  classificationType.textContent = classifiedLayoutType ?? (mode.value === "auto" ? "等待分类" : mode.value);
}

function showDoodlePreview(show: boolean) {
  doodleStage.hidden = !show;
  receiptPaper.parentElement?.toggleAttribute("hidden", show);
}

function setStatus(message: string, state: "ready" | "loading" | "error") {
  apiStatus.textContent = message;
  apiStatus.dataset.state = state;
}

function setStepStatus(element: HTMLElement, message: string, state: "ready" | "loading" | "error") {
  element.textContent = message;
  element.dataset.state = state;
}

function formatApiError(payload: { error?: string; detail?: string }, fallback: string): string {
  const detail = payload.detail || payload.error || fallback;
  if (detail.includes("Model disabled")) {
    return `${fallback} 当前视觉模型不可用：Model disabled。请在 .env 中更换 SILICONFLOW_VISION_MODEL，或确认该模型已在 SiliconFlow 账号中启用。`;
  }
  return detail;
}

function setBusy(button: HTMLButtonElement, busy: boolean, label: string) {
  button.disabled = busy;
  button.textContent = label;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Failed to read image.")));
    reader.readAsDataURL(file);
  });
}

function mustQuery<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing DOM element: ${selector}`);
  return element;
}

aiCommentEl.textContent = "尚未调用 API，当前为本地模板预览。";
classificationReason.textContent = "尚未分类。";
classificationConfidence.textContent = "-";
setStepStatus(imageStatus, "请选择示例图或上传图片。", "ready");
setStepStatus(classificationStatus, "等待三分类。", "ready");
setStatus("API 就绪。可以从图片分析开始，也可以直接编辑文字生成。", "ready");
renderClassification();
renderLocal();
