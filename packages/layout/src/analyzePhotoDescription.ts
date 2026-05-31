import type { PhotoAnalysis } from "./types.js";
import { clamp, includesAny, matchKeywords, unique } from "./utils.js";

const sceneMap = [
  { type: "朋友合照现场", keywords: ["朋友合照", "多人合影", "聚会", "聚餐", "饭局", "派对", "KTV", "四个人", "多人自拍", "合照"] },
  { type: "单人自拍现场", keywords: ["自拍", "对镜", "镜子", "自拍杆", "前置", "半身照", "头像"] },
  { type: "宠物营业现场", keywords: ["小狗", "狗", "猫", "宠物", "小猫", "动物", "毛孩子", "猫猫", "狗狗"] },
  { type: "餐饮咖啡现场", keywords: ["美食", "菜", "餐厅", "食物", "咖啡", "甜点", "奶茶", "拉面", "火锅", "蛋糕", "外卖"] },
  { type: "便利店货架现场", keywords: ["便利店", "超市", "货架", "收银台", "商品", "包装", "饮料", "零食", "购物车", "商场"] },
  { type: "办公室打工现场", keywords: ["办公室", "工位", "电脑", "键盘", "会议", "白板", "文件", "打工", "学习", "书桌", "作业"] },
  { type: "家居杂物现场", keywords: ["室内", "房间", "家里", "卧室", "桌子", "杂物", "沙发", "床", "厨房", "凌乱"] },
  { type: "街景通勤现场", keywords: ["街道", "路边", "地铁", "公交", "车站", "机场", "通勤", "车厢", "人行道", "夜市"] },
  { type: "旅行打卡现场", keywords: ["景点", "旅行", "建筑", "风景", "打卡", "游客", "山", "海边", "公园", "酒店"] },
  { type: "运动健身现场", keywords: ["运动", "健身", "跑步", "球场", "篮球", "足球", "瑜伽", "骑行", "滑雪"] },
  { type: "展览演出现场", keywords: ["展览", "博物馆", "演唱会", "舞台", "灯牌", "画展", "音乐节", "剧场"] },
  { type: "文字票据现场", keywords: ["截图", "屏幕", "票据", "小票", "菜单", "海报", "PPT", "文档", "二维码", "文字"] },
  { type: "情侣约会现场", keywords: ["情侣", "约会", "浪漫", "牵手", "拥抱", "玫瑰", "亲密"] },
  { type: "家庭聚会现场", keywords: ["家庭", "家人", "父母", "长辈", "孩子", "儿童", "亲子", "全家福"] },
  { type: "生日庆祝现场", keywords: ["生日", "生日蛋糕", "蜡烛", "庆生", "礼物", "许愿", "生日派对"] },
  { type: "婚礼庆典现场", keywords: ["婚礼", "新娘", "新郎", "婚纱", "礼服", "捧花", "婚宴", "仪式"] },
  { type: "厨房料理现场", keywords: ["厨房", "灶台", "锅", "料理", "烹饪", "切菜", "做饭", "菜板"] },
  { type: "教室学习现场", keywords: ["教室", "黑板", "课桌", "讲台", "课堂", "老师", "学生", "上课"] },
  { type: "图书馆自习现场", keywords: ["图书馆", "书架", "自习室", "阅读", "复习", "安静学习"] },
  { type: "宿舍生活现场", keywords: ["宿舍", "寝室", "上下铺", "舍友", "床铺", "宿管"] },
  { type: "车内移动现场", keywords: ["车内", "汽车", "驾驶座", "副驾驶", "方向盘", "后座", "车窗"] },
  { type: "地铁公交现场", keywords: ["地铁", "公交", "车厢", "站台", "扶手", "换乘", "轨道"] },
  { type: "机场候机现场", keywords: ["机场", "候机", "登机口", "行李箱", "航班", "登机牌"] },
  { type: "海边度假现场", keywords: ["海边", "沙滩", "海浪", "海水", "礁石", "泳装", "日落"] },
  { type: "山野徒步现场", keywords: ["徒步", "爬山", "山路", "山顶", "树林", "露营", "帐篷", "户外"] },
  { type: "公园散步现场", keywords: ["公园", "草坪", "花园", "湖边", "长椅", "散步", "遛狗"] },
  { type: "酒吧夜生活现场", keywords: ["酒吧", "鸡尾酒", "啤酒", "吧台", "夜店", "霓虹", "夜生活"] },
  { type: "演唱会剧场现场", keywords: ["演唱会", "剧场", "观众席", "舞台", "荧光棒", "乐队", "表演"] },
  { type: "后台准备现场", keywords: ["后台", "化妆间", "候场", "彩排", "道具间", "更衣室"] },
  { type: "医院诊所现场", keywords: ["医院", "诊所", "病房", "候诊", "药房", "检查室", "白大褂"] },
  { type: "工作室创作现场", keywords: ["工作室", "画室", "设计稿", "器材", "摄影棚", "商拍", "创作"] },
  { type: "商品静物现场", keywords: ["静物", "产品图", "商品展示", "摆件", "手作", "包装盒", "陈列"] },
  { type: "雨天记录现场", keywords: ["雨天", "下雨", "雨伞", "积水", "雨滴", "湿漉漉"] },
  { type: "夜景灯光现场", keywords: ["夜景", "灯光", "霓虹灯", "路灯", "夜晚", "城市灯光"] }
];

const subjectKeywords = [
  "朋友",
  "人",
  "人物",
  "小狗",
  "狗",
  "猫",
  "宠物",
  "情侣",
  "背景",
  "建筑",
  "食物",
  "脸",
  "表情",
  "商品",
  "电脑",
  "手机",
  "屏幕",
  "桌面",
  "海报",
  "文字",
  "车站",
  "街道",
  "灯光",
  "家人",
  "父母",
  "长辈",
  "孩子",
  "儿童",
  "情侣",
  "同事",
  "同学",
  "老师",
  "学生",
  "饮品",
  "奶茶",
  "咖啡",
  "甜点",
  "植物",
  "花束",
  "车辆",
  "汽车",
  "行李箱",
  "服装",
  "配饰",
  "手工作品",
  "票据",
  "文档",
  "舞台",
  "乐队",
  "雨伞"
];

const flawRules = [
  { flaw: "有人被裁出画面", keywords: ["裁掉", "半张脸", "切掉", "没了", "被画面开除"] },
  { flaw: "主体太小", keywords: ["人物非常小", "人很小", "主体太小", "几乎看不清", "太远"] },
  { flaw: "镜头距离过近", keywords: ["太近", "脸离镜头", "特写", "贴脸"] },
  { flaw: "画面偏糊", keywords: ["糊", "模糊", "虚焦", "抖"] },
  { flaw: "光线偏暗", keywords: ["太暗", "偏暗", "光线差", "昏暗"] },
  { flaw: "背景抢戏", keywords: ["背景", "杂物", "抢镜", "乱"] },
  { flaw: "表情过于有戏", keywords: ["表情夸张", "表情很夸张", "呆", "尴尬", "放空", "委屈"] },
  { flaw: "信息量过载", keywords: ["很多字", "文字很多", "密密麻麻", "信息量", "票据", "截图", "菜单", "PPT"] },
  { flaw: "道具抢主角", keywords: ["商品", "包装", "杯子", "盘子", "电脑", "手机", "海报", "道具", "货架"] },
  { flaw: "角度有点玄学", keywords: ["歪", "倾斜", "仰拍", "俯拍", "角度奇怪", "斜着"] },
  { flaw: "反光正在营业", keywords: ["反光", "玻璃", "镜子", "屏幕反光", "曝光", "过曝"] }
];

export function analyzePhotoDescription(description: string): PhotoAnalysis {
  const text = description.trim();
  const sceneType = scoreSceneType(text);
  const subjects = unique(matchKeywords(text, subjectKeywords));

  const flaws = flawRules
    .filter((rule) => includesAny(text, rule.keywords))
    .map((rule) => rule.flaw);

  const visualKeywords = unique([
    sceneType,
    ...subjects,
    ...matchKeywords(text, [
      "自拍",
      "合照",
      "景点",
      "建筑",
      "杂物",
      "暗",
      "可爱",
      "委屈",
      "夸张",
      "拥挤",
      "背景",
      "风景",
      "商品",
      "屏幕",
      "票据",
      "货架",
      "工位",
      "街景",
      "夜景",
      "反光",
      "过曝"
    ])
  ]);

  const photoQualityIssues = flaws.filter((flaw) =>
    ["有人被裁出画面", "主体太小", "镜头距离过近", "画面偏糊", "光线偏暗", "背景抢戏", "角度有点玄学", "反光正在营业"].includes(flaw)
  );

  const funnyPoints = unique([
    ...flaws,
    ...(includesAny(text, ["挤", "拥挤", "四个人"]) ? ["大家正在争夺画面生存权"] : []),
    ...(includesAny(text, ["表情夸张", "呆", "放空", "委屈"]) ? ["表情管理短暂离线"] : []),
    ...(includesAny(text, ["商品", "货架", "包装", "收银台"]) ? ["商品陈列比主角更懂营业"] : []),
    ...(includesAny(text, ["电脑", "工位", "文件", "学习", "作业"]) ? ["打工气息已经从画面边缘溢出"] : []),
    ...(includesAny(text, ["屏幕", "截图", "票据", "文字很多"]) ? ["文字密度正在申请小票编制"] : []),
    ...(includesAny(text, ["街道", "地铁", "车站", "通勤"]) ? ["路过感强到像临时抓拍证据"] : [])
  ]);

  const cutenessLevel = clamp(
    (includesAny(text, ["可爱", "萌", "乖", "小狗", "小猫", "宠物"]) ? 70 : 0) +
      (includesAny(text, ["委屈", "趴", "看着镜头"]) ? 20 : 0)
  );
  const awkwardLevel = clamp(
    (includesAny(text, ["尴尬", "呆", "放空", "无语"]) ? 75 : 0) +
      (includesAny(text, ["裁掉", "半张脸", "表情夸张"]) ? 20 : 0)
  );
  const chaosLevel = clamp(flaws.length * 18 + (includesAny(text, ["多人", "四个人", "挤", "杂物", "混乱", "货架", "很多字", "街道"]) ? 25 : 0));
  const roastPotential = clamp(
    flaws.length * 20 +
      funnyPoints.length * 12 +
      (includesAny(text, ["非常小", "半张脸", "太近", "太暗", "糊", "抢镜", "密密麻麻", "角度奇怪", "反光"]) ? 30 : 0)
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

function scoreSceneType(text: string): string {
  let best = { type: "生活切片现场", score: 0 };
  for (const scene of sceneMap) {
    const score = scene.keywords.reduce((total, keyword) => {
      if (!text.includes(keyword)) return total;
      return total + Math.max(1, Math.min(5, Math.ceil(keyword.length / 2)));
    }, 0);
    if (score > best.score) best = { type: scene.type, score };
  }
  return best.score > 0 ? best.type : "生活切片现场";
}

function detectPunchline(text: string): string | undefined {
  if (includesAny(text, ["人物非常小", "人很小", "主体太小", "几乎看不清"])) return "人呢？";
  if (includesAny(text, ["裁掉半张脸", "半张脸", "裁掉"])) return "右边那位：我也是人";
  if (includesAny(text, ["太近", "脸离镜头", "贴脸"])) return "这不是自拍，是脸部特写事故";
  if (includesAny(text, ["糊", "模糊", "虚焦"])) return "画质正在逃跑";
  if (includesAny(text, ["太暗", "偏暗", "光线差"])) return "灯呢？";
  if (includesAny(text, ["背景抢镜", "杂物", "背景很乱"])) return "背景申请当主角";
  if (includesAny(text, ["商品", "货架", "包装"])) return "商品比人更会摆拍";
  if (includesAny(text, ["电脑", "工位", "文件"])) return "打工味已经溢出屏幕";
  if (includesAny(text, ["很多字", "密密麻麻", "票据", "截图"])) return "信息量正在超载";
  if (includesAny(text, ["反光", "玻璃", "屏幕反光"])) return "反光也想入镜";
  return undefined;
}

function detectMood(text: string, cuteness: number, awkward: number, chaos: number): string {
  if (cuteness >= 75) return "可爱";
  if (includesAny(text, ["治愈", "温柔", "舒服", "安静", "柔和"])) return "治愈";
  if (includesAny(text, ["热闹", "庆祝", "生日", "婚礼", "欢呼"])) return "热闹";
  if (includesAny(text, ["疲惫", "困", "累", "下班", "倦"])) return "疲惫";
  if (includesAny(text, ["紧张", "严肃", "正式", "会议", "候场"])) return "紧张";
  if (includesAny(text, ["孤独", "空旷", "一个人", "独自"])) return "孤独";
  if (includesAny(text, ["松弛", "放松", "悠闲", "散步", "度假"])) return "松弛";
  if (includesAny(text, ["浪漫", "甜", "情侣"])) return "浪漫";
  if (awkward >= 75) return "尴尬";
  if (chaos >= 70) return "失控";
  if (includesAny(text, ["办公室", "工位", "作业", "文件", "会议"])) return "打工感";
  if (includesAny(text, ["便利店", "货架", "商品", "包装"])) return "营业感";
  if (includesAny(text, ["街道", "地铁", "车站", "机场", "通勤"])) return "路过感";
  if (includesAny(text, ["展览", "演唱会", "舞台", "灯牌"])) return "现场感";
  if (includesAny(text, ["酷", "帅", "墨镜"])) return "很酷";
  return "轻微想吐槽";
}
