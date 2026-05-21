import type {
  BigTextContent,
  LayoutSkill,
  LayoutType,
  PhotoAnalysis,
  PixelExpressionContent,
  PixelFaceType,
  ReceiptContent,
  RoastLevel
} from "./types.js";
import { bar, choose, selectSkill, stars } from "./utils.js";

export function generateRoastContent(
  analysis: PhotoAnalysis,
  layoutType: LayoutType,
  roastLevel: RoastLevel = "normal",
  skills: LayoutSkill[] = [],
  generatedComment?: string
): ReceiptContent | BigTextContent | PixelExpressionContent {
  const skill = selectSkill(skills, layoutType, analysis, roastLevel);

  if (layoutType === "big_text") return generateBigTextContent(analysis, roastLevel, skill, generatedComment);
  if (layoutType === "pixel_expression") return generatePixelExpressionContent(analysis, roastLevel, generatedComment);
  return generateReceiptContent(analysis, roastLevel, skill, generatedComment);
}

export function generateReceiptContent(
  analysis: PhotoAnalysis,
  roastLevel: RoastLevel = "normal",
  skill?: LayoutSkill,
  generatedComment?: string
): ReceiptContent {
  const motifs = skill?.visualMotifs?.length ? skill.visualMotifs : ["照片审判小票", "照片检测单", "今日成片报告"];
  const findings = buildFindings(analysis).slice(0, 4);

  return {
    title: "SNAP ROAST BUDDY",
    subtitle: choose(motifs, analysis.sceneType),
    photoType: analysis.sceneType,
    atmosphere: analysis.chaosLevel >= 65 ? "热闹但有点失控" : analysis.mood === "可爱" ? "可爱值超标" : "努力营业中",
    aiMood: roastLevel === "spicy" ? "已经开始憋大招" : analysis.mood === "可爱" ? "被可爱击中" : "正在憋笑",
    findings,
    scores: [
      { label: "离谱指数", value: Math.max(35, analysis.roastPotential) },
      { label: "构图安全", value: 100 - Math.min(80, analysis.photoQualityIssues.length * 22 + analysis.chaosLevel / 3) },
      { label: "可发程度", value: Math.max(30, 82 - analysis.photoQualityIssues.length * 13 + analysis.cutenessLevel / 5) }
    ],
    roast: generatedComment?.trim() || receiptRoast(analysis, roastLevel),
    advice: adviceFor(analysis),
    verdict: verdictFor(analysis, roastLevel)
  };
}

export function generateBigTextContent(
  analysis: PhotoAnalysis,
  roastLevel: RoastLevel = "normal",
  skill?: LayoutSkill,
  generatedComment?: string
): BigTextContent {
  const motifs = skill?.visualMotifs?.length
    ? skill.visualMotifs
    : [">>> 紧急播报 <<<", "!!! 构图警告 !!!", ">>> 现场判定 <<<", "=== 本机震惊 ==="];
  const punchline = analysis.strongestPunchline ?? choose(["主体失踪", "画面有情况", "本机暂停思考"], analysis.sceneType);
  const headline = headlineFromPunchline(punchline);

  return {
    topLabel: choose(motifs, punchline),
    headline,
    subHeadline: punchline.includes("：") ? punchline.split("：")[0] : undefined,
    oneLineRoast: generatedComment?.trim() || oneLineRoastFor(analysis, roastLevel),
    tinyAdvice: adviceFor(analysis, true)
  };
}

export function generatePixelExpressionContent(
  analysis: PhotoAnalysis,
  roastLevel: RoastLevel = "normal",
  generatedComment?: string
): PixelExpressionContent {
  const faceType = faceFor(analysis);

  return {
    faceType,
    moodLabel: moodLabelFor(faceType, analysis),
    keywords: (analysis.visualKeywords.length ? analysis.visualKeywords : [analysis.sceneType, analysis.mood]).slice(0, 4),
    shortComment: generatedComment?.trim() || pixelCommentFor(analysis, faceType, roastLevel)
  };
}

function buildFindings(analysis: PhotoAnalysis): string[] {
  const findings = analysis.funnyPoints.map((point) => {
    if (point === "有人被裁出画面") return "边缘朋友只获得部分出场许可";
    if (point === "主体太小") return "主角正在和背景玩躲猫猫";
    if (point === "背景抢戏") return "背景正在积极申请主角位";
    if (point === "光线偏暗") return "光线偏暗，但气氛很努力";
    if (point === "表情过于有戏") return "表情管理已进入综艺频道";
    return point;
  });

  if (!findings.length) findings.push("画面整体还算稳定，但本机仍然发现了吐槽空间");
  return findings;
}

function receiptRoast(analysis: PhotoAnalysis, roastLevel: RoastLevel): string {
  if (analysis.flaws.includes("有人被裁出画面")) {
    return "这张照片像一场友情生存挑战，\n每个人都在努力挤进历史。";
  }
  if (analysis.flaws.includes("主体太小")) {
    return "风景非常成功，\n主角则选择低调到接近隐身。";
  }
  if (analysis.cutenessLevel >= 75) {
    return "本机原本准备吐槽，\n但可爱程度导致审判流程中断。";
  }
  if (roastLevel === "spicy") {
    return "这张照片不是失误，\n是对摄影规则的一次公开挑战。";
  }
  return "这张照片的优点是很真实，\n缺点是真实得有点太努力。";
}

function oneLineRoastFor(analysis: PhotoAnalysis, roastLevel: RoastLevel): string {
  if (analysis.flaws.includes("主体太小")) return "本机找了半天，\n终于在风景里发现了你。";
  if (analysis.flaws.includes("有人被裁出画面")) return "请确认朋友没有被画面开除。";
  if (analysis.flaws.includes("镜头距离过近")) return "镜头说：我有点害怕。";
  if (analysis.flaws.includes("画面偏糊")) return "这一刻很珍贵，\n可惜画质先撤退了。";
  if (analysis.flaws.includes("光线偏暗")) return "气氛到了，\n灯光还在路上。";
  return roastLevel === "spicy" ? "本机短暂沉默，\n然后选择打印证据。" : "这张很有记忆点，\n主要是因为它很难忘。";
}

function adviceFor(analysis: PhotoAnalysis, tiny = false): string {
  const prefix = tiny ? "建议：" : "";
  if (analysis.flaws.includes("主体太小")) return `${prefix}下次让主角稍微大于蚂蚁`;
  if (analysis.flaws.includes("有人被裁出画面")) return `${prefix}手机拿远一点，给每位朋友完整出场机会。`;
  if (analysis.flaws.includes("光线偏暗")) return `${prefix}补一点光，别让气氛独自上班。`;
  if (analysis.flaws.includes("画面偏糊")) return `${prefix}按快门前先稳住，别让回忆产生重影。`;
  if (analysis.flaws.includes("背景抢戏")) return `${prefix}换个干净背景，让主角重新夺回主场。`;
  return `${prefix}保留这张，但可以再拍一张当保险。`;
}

function verdictFor(analysis: PhotoAnalysis, roastLevel: RoastLevel): string {
  if (analysis.cutenessLevel >= 75) return "不许删，本机批准收藏";
  if (analysis.roastPotential >= 80) return roastLevel === "spicy" ? "建议发，但请准备解释权" : "可发，但需要配文狡辩";
  return "可发，轻微加工后更稳";
}

function headlineFromPunchline(punchline: string): string {
  if (punchline.includes("人呢")) return "人 呢 ？";
  if (punchline.includes("我也是人")) return "我 也 是 人";
  if (punchline.includes("背景")) return "背 景 上 位";
  if (punchline.includes("灯")) return "灯 呢 ？";
  if (punchline.includes("画质")) return "画 质 出 走";
  return punchline.length <= 6 ? punchline : punchline.slice(0, 6);
}

function faceFor(analysis: PhotoAnalysis): PixelFaceType {
  if (analysis.cutenessLevel >= 75) return "heart";
  if (analysis.flaws.includes("画面偏糊")) return "cry";
  if (analysis.mood === "很酷") return "cool";
  if (analysis.awkwardLevel >= 75) return "speechless";
  if (analysis.roastPotential >= 80) return "shocked";
  if (analysis.flaws.length === 0) return "smirk";
  return "question";
}

function moodLabelFor(faceType: PixelFaceType, analysis: PhotoAnalysis): string {
  const labels: Record<PixelFaceType, string> = {
    speechless: "灵魂加载失败",
    smirk: "憋笑",
    shocked: "本机震惊",
    heart: "被可爱击中",
    cry: "画质哭哭",
    cool: "酷到点头",
    question: "问号脸"
  };
  return analysis.mood === "浪漫" ? "甜度超标" : labels[faceType];
}

function pixelCommentFor(analysis: PhotoAnalysis, faceType: PixelFaceType, roastLevel: RoastLevel): string {
  if (faceType === "heart") return "这张不许删。\n本机批准收藏。";
  if (faceType === "cry") return "本人还在，\n清晰度可能刚刚掉线了。";
  if (faceType === "speechless") return "这不是合照，\n这是友情生存挑战。";
  if (faceType === "shocked") return "本机看到这里，\n处理器轻轻叹了口气。";
  if (roastLevel === "gentle") return "有点好笑，\n但还挺可爱。";
  return "本机短评：\n画面很努力，效果很有戏。";
}

export { bar, stars };
