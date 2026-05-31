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
  const motifs = skill?.visualMotifs?.length ? skill.visualMotifs : ["今日照片审判小票", "照片检测单", "AI 成片体检报告"];
  const findings = buildFindings(analysis).slice(0, 6);

  return {
    title: "拍立怼 Snap Roast Buddy",
    subtitle: choose(motifs, analysis.sceneType),
    photoType: analysis.sceneType,
    atmosphere: atmosphereFor(analysis),
    aiMood: aiMoodFor(analysis, roastLevel),
    findings,
    scores: [
      { label: "槽点密度", value: Math.max(35, analysis.roastPotential) },
      { label: "画面秩序", value: 100 - Math.min(80, analysis.photoQualityIssues.length * 22 + analysis.chaosLevel / 3) },
      { label: "分享价值", value: Math.max(30, 82 - analysis.photoQualityIssues.length * 13 + analysis.cutenessLevel / 5) },
      { label: "光线友好", value: Math.max(24, 88 - (analysis.photoQualityIssues.some((issue) => issue.includes("光线") || issue.includes("暗")) ? 42 : 8)) },
      { label: "主体稳定", value: Math.max(22, 86 - analysis.flaws.length * 9 - analysis.chaosLevel / 4) },
      { label: "背景克制", value: Math.max(18, 92 - analysis.chaosLevel - analysis.flaws.length * 5) },
      { label: "情绪感染", value: Math.max(32, Math.min(96, 48 + analysis.cutenessLevel / 3 + analysis.awkwardLevel / 4)) },
      { label: "时机准确", value: Math.max(24, 84 - analysis.awkwardLevel / 2 - analysis.photoQualityIssues.length * 7) },
      { label: "空间层次", value: Math.max(28, 88 - analysis.chaosLevel / 2 - analysis.photoQualityIssues.length * 6) },
      { label: "救片难度", value: Math.min(96, 24 + analysis.photoQualityIssues.length * 13 + analysis.chaosLevel / 3) }
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
    if (point.includes("裁")) return "边缘朋友只获得部分出场许可";
    if (point.includes("主体") || point.includes("太小")) return "主角正在和背景玩躲猫猫";
    if (point.includes("背景")) return "背景正在积极申请主角位";
    if (point.includes("光线") || point.includes("暗")) return "光线偏暗，但气氛很努力";
    if (point.includes("表情")) return "表情管理已进入综艺频道";
    return point;
  });

  const sceneFinding = findingForScene(analysis);
  if (sceneFinding) findings.unshift(sceneFinding);
  if (!findings.length) findings.push("画面整体还算稳定，但本机仍然发现了吐槽空间");
  return uniqueStrings(findings);
}

function receiptRoast(analysis: PhotoAnalysis, roastLevel: RoastLevel): string {
  if (hasIssue(analysis, "裁")) {
    return "这张照片像一场友情生存挑战，\n每个人都在努力挤进历史。";
  }
  if (hasIssue(analysis, "主体") || hasIssue(analysis, "太小")) {
    return "风景非常成功，\n主角则选择低调到接近隐身。";
  }
  if (analysis.cutenessLevel >= 75) {
    return "本机原本准备吐槽，\n但可爱程度导致审判流程中断。";
  }
  if (sceneIncludes(analysis, "便利店", "餐饮", "商品")) {
    return "这张照片的消费气息很完整，\n本机差点以为自己要开发票。";
  }
  if (sceneIncludes(analysis, "办公室", "打工", "学习")) {
    return "画面里有一种熟悉的努力感，\n像周一早上还没加载完的人生。";
  }
  if (sceneIncludes(analysis, "街景", "通勤", "旅行")) {
    return "这张照片很有路过感，\n像生活突然按下了截图键。";
  }
  if (sceneIncludes(analysis, "文字", "票据", "截图")) {
    return "信息量已经排队进场，\n本机负责把它们打印成证据。";
  }
  if (roastLevel === "spicy") {
    return "这张照片不是失误，\n是对摄影规则的一次公开挑战。";
  }
  return "这张照片的优点是很真实，\n缺点是真实得有点太努力。";
}

function oneLineRoastFor(analysis: PhotoAnalysis, roastLevel: RoastLevel): string {
  if (hasIssue(analysis, "主体") || hasIssue(analysis, "太小")) return "本机找了半天，\n终于在风景里发现了你。";
  if (hasIssue(analysis, "裁")) return "请确认朋友没有被画面开除。";
  if (hasIssue(analysis, "太近")) return "镜头说：我有点害怕。";
  if (hasIssue(analysis, "糊")) return "这一刻很珍贵，\n可惜画质先撤退了。";
  if (hasIssue(analysis, "暗") || hasIssue(analysis, "光线")) return "气氛到了，\n灯光还在路上。";
  if (sceneIncludes(analysis, "商品", "便利店")) return "商品陈列赢了，\n主角暂时申请补位。";
  if (sceneIncludes(analysis, "办公室", "打工")) return "打工味很浓，\n像照片也想下班。";
  if (sceneIncludes(analysis, "文字", "票据", "截图")) return "字太多了，\n本机先打印一份冷静一下。";
  return roastLevel === "spicy" ? "本机短暂沉默，\n然后选择打印证据。" : "这张很有记忆点，\n主要是因为它很难忘。";
}

function adviceFor(analysis: PhotoAnalysis, tiny = false): string {
  const prefix = tiny ? "建议：" : "";
  if (hasIssue(analysis, "主体") || hasIssue(analysis, "太小")) return `${prefix}下次让主角稍微大于蚂蚁`;
  if (hasIssue(analysis, "裁")) return `${prefix}手机拿远一点，给每位朋友完整出场机会。`;
  if (hasIssue(analysis, "暗") || hasIssue(analysis, "光线")) return `${prefix}补一点光，别让气氛独自上班。`;
  if (hasIssue(analysis, "糊")) return `${prefix}按快门前先稳住，别让回忆产生重影。`;
  if (hasIssue(analysis, "背景")) return `${prefix}换个干净背景，让主角重新夺回主场。`;
  if (sceneIncludes(analysis, "便利店", "商品")) return `${prefix}靠近主体一点，别让货架替你出道。`;
  if (sceneIncludes(analysis, "办公室", "学习")) return `${prefix}把桌面清出一小块主场，打工感会少三分。`;
  if (sceneIncludes(analysis, "街景", "通勤")) return `${prefix}等路人和背景冷静一秒，再按快门。`;
  if (sceneIncludes(analysis, "文字", "票据", "截图")) return `${prefix}保留重点文字，其余信息交给小票慢慢审。`;
  return `${prefix}保留这张，但可以再拍一张当保险。`;
}

function verdictFor(analysis: PhotoAnalysis, roastLevel: RoastLevel): string {
  if (analysis.cutenessLevel >= 75) return "不许删，本机批准收藏";
  if (sceneIncludes(analysis, "文字", "票据", "截图")) return "适合存档，证据感很强";
  if (sceneIncludes(analysis, "办公室", "打工")) return "建议收藏，下班后再审";
  if (sceneIncludes(analysis, "便利店", "商品")) return "可发，像一张消费现场证词";
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
  if (analysis.cutenessLevel >= 75 || analysis.mood === "浪漫") return "cute_love";
  if (analysis.photoQualityIssues.some((issue) => issue.includes("糊") || issue.includes("暗"))) return "sad_cry";
  if (analysis.mood === "很酷") return "happy_proud";
  if (analysis.awkwardLevel >= 75) return "awkward_speechless";
  if (analysis.roastPotential >= 85) return "angry_roast";
  if (analysis.roastPotential >= 70 || analysis.strongestPunchline) return "shocked_confused";
  if (analysis.flaws.length === 0) return "happy_proud";
  return "begging_give";
}

function moodLabelFor(faceType: PixelFaceType, analysis: PhotoAnalysis): string {
  const labels: Record<PixelFaceType, string> = {
    cute_love: "被可爱击中",
    happy_proud: "得意营业",
    awkward_speechless: "灵魂加载失败",
    shocked_confused: "本机震惊",
    angry_roast: "开怼预备",
    sad_cry: "画质哭哭",
    begging_give: "拜托再拍一张",
    farewell: "溜了溜了"
  };
  if (analysis.mood === "浪漫") return "甜度超标";
  if (analysis.mood === "打工感") return "下班失败";
  if (analysis.mood === "营业感") return "货架震惊";
  if (analysis.mood === "路过感") return "路过抓拍";
  return labels[faceType];
}

function pixelCommentFor(analysis: PhotoAnalysis, faceType: PixelFaceType, roastLevel: RoastLevel): string {
  if (faceType === "cute_love") return "这张不许删。\n本机批准收藏。";
  if (faceType === "sad_cry") return "本人还在，\n清晰度可能刚刚掉线。";
  if (faceType === "awkward_speechless") return "这不是合照，\n这是友情生存挑战。";
  if (faceType === "shocked_confused") return "本机看到这里，\n处理器轻轻叹了口气。";
  if (faceType === "angry_roast") return "本机短评：\n画面很努力，效果很有戏。";
  if (faceType === "begging_give") return "拜托，\n给这张照片一次补拍机会。";
  if (faceType === "farewell") return "本机先溜，\n证据已经打印。";
  if (roastLevel === "gentle") return "有点好笑，\n但还挺可爱。";
  return "本机短评：\n这张很有记忆点。";
}

function hasIssue(analysis: PhotoAnalysis, keyword: string): boolean {
  return [...analysis.flaws, ...analysis.funnyPoints, ...analysis.photoQualityIssues].some((item) => item.includes(keyword));
}

function atmosphereFor(analysis: PhotoAnalysis): string {
  if (analysis.chaosLevel >= 65) return "热闹但有点失控";
  if (analysis.mood === "可爱") return "可爱值超标";
  if (analysis.mood === "打工感") return "努力上班中";
  if (analysis.mood === "营业感") return "商品正在营业";
  if (analysis.mood === "路过感") return "临时路过现场";
  if (analysis.mood === "现场感") return "现场感拉满";
  return "努力营业中";
}

function aiMoodFor(analysis: PhotoAnalysis, roastLevel: RoastLevel): string {
  if (roastLevel === "spicy") return "已经开始憋大招";
  if (analysis.mood === "可爱") return "被可爱击中";
  if (analysis.mood === "打工感") return "想替你下班";
  if (analysis.mood === "营业感") return "正在盘点货架";
  if (analysis.mood === "路过感") return "抓到路过证据";
  return "正在憋笑";
}

function findingForScene(analysis: PhotoAnalysis): string | undefined {
  if (sceneIncludes(analysis, "便利店", "商品")) return "货架和商品正在努力抢走镜头绩效";
  if (sceneIncludes(analysis, "办公室", "打工", "学习")) return "桌面信息透露出一种不想上班的诚实";
  if (sceneIncludes(analysis, "街景", "通勤")) return "背景流动感很强，像现场刚被临时截胡";
  if (sceneIncludes(analysis, "文字", "票据", "截图")) return "文字密度很高，适合进入证据保存流程";
  if (sceneIncludes(analysis, "餐饮", "咖啡")) return "食物很努力，拍摄时机也很努力";
  return undefined;
}

function sceneIncludes(analysis: PhotoAnalysis, ...keywords: string[]): boolean {
  const haystack = [analysis.sceneType, analysis.mood, ...analysis.visualKeywords].join(" ");
  return keywords.some((keyword) => haystack.includes(keyword));
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export { bar, stars };
