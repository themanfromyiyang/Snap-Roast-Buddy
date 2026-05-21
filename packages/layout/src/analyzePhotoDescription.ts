import type { PhotoAnalysis } from "./types.js";
import { clamp, includesAny, matchKeywords, unique } from "./utils.js";

const sceneMap = [
  { type: "朋友聚会自拍", keywords: ["朋友", "聚会", "合照", "自拍", "四个人", "多人"] },
  { type: "旅行打卡", keywords: ["景点", "旅行", "建筑", "风景", "打卡", "游客"] },
  { type: "宠物照片", keywords: ["小狗", "狗", "猫", "宠物", "小猫", "动物"] },
  { type: "美食照片", keywords: ["美食", "菜", "餐厅", "食物", "咖啡", "甜点"] },
  { type: "情侣照", keywords: ["情侣", "约会", "浪漫", "牵手", "拥抱"] },
  { type: "室内生活照", keywords: ["室内", "房间", "家里", "桌子", "杂物"] }
];

const subjectKeywords = ["朋友", "人", "人物", "小狗", "狗", "猫", "宠物", "情侣", "背景", "建筑", "食物", "脸", "表情"];

const flawRules = [
  { flaw: "有人被裁出画面", keywords: ["裁掉", "半张脸", "切掉", "没了", "被画面开除"] },
  { flaw: "主体太小", keywords: ["人物非常小", "人很小", "主体太小", "几乎看不清", "太远"] },
  { flaw: "镜头距离过近", keywords: ["太近", "脸离镜头", "特写", "贴脸"] },
  { flaw: "画面偏糊", keywords: ["糊", "模糊", "虚焦", "抖"] },
  { flaw: "光线偏暗", keywords: ["太暗", "偏暗", "光线差", "昏暗"] },
  { flaw: "背景抢戏", keywords: ["背景", "杂物", "抢镜", "乱"] },
  { flaw: "表情过于有戏", keywords: ["表情夸张", "表情很夸张", "呆", "尴尬", "放空", "委屈"] }
];

export function analyzePhotoDescription(description: string): PhotoAnalysis {
  const text = description.trim();
  const sceneType = sceneMap.find((scene) => includesAny(text, scene.keywords))?.type ?? "生活照片";
  const subjects = unique(matchKeywords(text, subjectKeywords));

  const flaws = flawRules
    .filter((rule) => includesAny(text, rule.keywords))
    .map((rule) => rule.flaw);

  const visualKeywords = unique([
    ...subjects,
    ...matchKeywords(text, ["自拍", "合照", "景点", "建筑", "杂物", "暗", "可爱", "委屈", "夸张", "拥挤", "背景", "风景"])
  ]);

  const photoQualityIssues = flaws.filter((flaw) =>
    ["有人被裁出画面", "主体太小", "镜头距离过近", "画面偏糊", "光线偏暗", "背景抢戏"].includes(flaw)
  );

  const funnyPoints = unique([
    ...flaws,
    ...(includesAny(text, ["挤", "拥挤", "四个人"]) ? ["大家正在争夺画面生存权"] : []),
    ...(includesAny(text, ["表情夸张", "呆", "放空", "委屈"]) ? ["表情管理短暂离线"] : [])
  ]);

  const cutenessLevel = clamp(
    (includesAny(text, ["可爱", "萌", "乖", "小狗", "小猫", "宠物"]) ? 70 : 0) +
      (includesAny(text, ["委屈", "趴", "看着镜头"]) ? 20 : 0)
  );
  const awkwardLevel = clamp(
    (includesAny(text, ["尴尬", "呆", "放空", "无语"]) ? 75 : 0) +
      (includesAny(text, ["裁掉", "半张脸", "表情夸张"]) ? 20 : 0)
  );
  const chaosLevel = clamp(flaws.length * 18 + (includesAny(text, ["多人", "四个人", "挤", "杂物", "混乱"]) ? 25 : 0));
  const roastPotential = clamp(
    flaws.length * 20 +
      funnyPoints.length * 12 +
      (includesAny(text, ["非常小", "半张脸", "太近", "太暗", "糊", "抢镜"]) ? 30 : 0)
  );

  const strongestPunchline = detectPunchline(text);
  const mood = detectMood(text, cutenessLevel, awkwardLevel, chaosLevel);

  return {
    sceneType,
    subjects,
    mood,
    flaws,
    funnyPoints,
    visualKeywords,
    roastPotential,
    chaosLevel,
    cutenessLevel,
    awkwardLevel,
    photoQualityIssues,
    strongestPunchline
  };
}

function detectPunchline(text: string): string | undefined {
  if (includesAny(text, ["人物非常小", "人很小", "主体太小", "几乎看不清"])) return "人呢？";
  if (includesAny(text, ["裁掉半张脸", "半张脸", "裁掉"])) return "右边那位：我也是人";
  if (includesAny(text, ["太近", "脸离镜头", "贴脸"])) return "这不是自拍，是脸部特写事故";
  if (includesAny(text, ["糊", "模糊", "虚焦"])) return "画质正在逃跑";
  if (includesAny(text, ["太暗", "偏暗", "光线差"])) return "灯呢？";
  if (includesAny(text, ["背景抢镜", "杂物", "背景很乱"])) return "背景申请当主角";
  return undefined;
}

function detectMood(text: string, cuteness: number, awkward: number, chaos: number): string {
  if (cuteness >= 75) return "可爱";
  if (includesAny(text, ["浪漫", "甜", "情侣"])) return "浪漫";
  if (awkward >= 75) return "尴尬";
  if (chaos >= 70) return "失控";
  if (includesAny(text, ["酷", "帅", "墨镜"])) return "很酷";
  return "轻微想吐槽";
}
