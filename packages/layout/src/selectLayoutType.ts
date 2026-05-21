import type { LayoutType, PhotoAnalysis, RoastMode } from "./types.js";

export function selectLayoutType(analysis: PhotoAnalysis, userMode: RoastMode = "auto"): LayoutType {
  if (userMode !== "auto") return userMode;

  const isRichScene = analysis.funnyPoints.length >= 3 || analysis.flaws.length >= 3;
  if (isRichScene && analysis.sceneType !== "旅行打卡") {
    return "receipt";
  }

  if (analysis.strongestPunchline && analysis.roastPotential >= 75) {
    return "big_text";
  }

  if (
    analysis.cutenessLevel >= 75 ||
    analysis.awkwardLevel >= 75 ||
    ["可爱", "尴尬", "震惊", "无语", "浪漫"].includes(analysis.mood)
  ) {
    return "pixel_expression";
  }

  return "receipt";
}

export function explainLayoutChoice(analysis: PhotoAnalysis, layoutType: LayoutType): string {
  if (layoutType === "big_text") {
    return `照片存在明确爆点「${analysis.strongestPunchline ?? analysis.funnyPoints[0] ?? "强烈槽点"}」，适合用横向大字做第一眼笑点。`;
  }

  if (layoutType === "pixel_expression") {
    return `照片情绪很明确（${analysis.mood}），用像素表情能强化设备被照片刺激到的角色感。`;
  }

  return "画面信息较多，有多个可点评元素，适合生成一张带层级的照片审判小票。";
}
