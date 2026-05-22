// packages/layout/src/utils.ts
var clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
var unique = (items) => [...new Set(items)];
function includesAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}
function matchKeywords(text, keywords) {
  return keywords.filter((keyword) => text.includes(keyword));
}
function bar(value, slots = 10) {
  const filled = Math.round(clamp(value) / 100 * slots);
  return `${"\u2588".repeat(filled)}${"\u2591".repeat(slots - filled)} ${clamp(value)}%`;
}
function stars(value) {
  const filled = Math.max(1, Math.round(clamp(value) / 20));
  return `${"\u2605".repeat(filled)}${"\u2606".repeat(5 - filled)}`;
}
function choose(items, seedText) {
  const seed = [...seedText].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return items[seed % items.length];
}
function selectSkill(skills, layoutType2, analysis, roastLevel2) {
  const haystack = [
    analysis.sceneType,
    analysis.mood,
    ...analysis.subjects,
    ...analysis.flaws,
    ...analysis.funnyPoints,
    ...analysis.visualKeywords,
    ...analysis.photoQualityIssues
  ].join(" ");
  return skills.filter((skill) => skill.layoutType === layoutType2).map((skill) => {
    const keywordHits = skill.triggerKeywords?.filter((keyword) => haystack.includes(keyword)).length ?? 0;
    const toneBonus = skill.tone === roastLevel2 ? 2 : 0;
    return { skill, score: keywordHits * 3 + toneBonus };
  }).sort((a, b) => b.score - a.score)[0]?.skill;
}
function wrapText(text, maxUnits) {
  const lines = [];
  let current = "";
  let width = 0;
  for (const char of text) {
    if (char === "\n") {
      lines.push(current);
      current = "";
      width = 0;
      continue;
    }
    const charWidth = /[\u0000-\u00ff]/.test(char) ? 1 : 2;
    if (width + charWidth > maxUnits && current.length > 0) {
      lines.push(current);
      current = char;
      width = charWidth;
    } else {
      current += char;
      width += charWidth;
    }
  }
  if (current) lines.push(current);
  return lines;
}
function centerText(text, width) {
  const visualWidth = [...text].reduce((sum, char) => sum + (/[\u0000-\u00ff]/.test(char) ? 1 : 2), 0);
  const left = Math.max(0, Math.floor((width - visualWidth) / 2));
  return `${" ".repeat(left)}${text}`;
}

// packages/layout/src/analyzePhotoDescription.ts
var sceneMap = [
  { type: "\u670B\u53CB\u805A\u4F1A\u81EA\u62CD", keywords: ["\u670B\u53CB", "\u805A\u4F1A", "\u5408\u7167", "\u81EA\u62CD", "\u56DB\u4E2A\u4EBA", "\u591A\u4EBA"] },
  { type: "\u65C5\u884C\u6253\u5361", keywords: ["\u666F\u70B9", "\u65C5\u884C", "\u5EFA\u7B51", "\u98CE\u666F", "\u6253\u5361", "\u6E38\u5BA2"] },
  { type: "\u5BA0\u7269\u7167\u7247", keywords: ["\u5C0F\u72D7", "\u72D7", "\u732B", "\u5BA0\u7269", "\u5C0F\u732B", "\u52A8\u7269"] },
  { type: "\u7F8E\u98DF\u7167\u7247", keywords: ["\u7F8E\u98DF", "\u83DC", "\u9910\u5385", "\u98DF\u7269", "\u5496\u5561", "\u751C\u70B9"] },
  { type: "\u60C5\u4FA3\u7167", keywords: ["\u60C5\u4FA3", "\u7EA6\u4F1A", "\u6D6A\u6F2B", "\u7275\u624B", "\u62E5\u62B1"] },
  { type: "\u5BA4\u5185\u751F\u6D3B\u7167", keywords: ["\u5BA4\u5185", "\u623F\u95F4", "\u5BB6\u91CC", "\u684C\u5B50", "\u6742\u7269"] }
];
var subjectKeywords = ["\u670B\u53CB", "\u4EBA", "\u4EBA\u7269", "\u5C0F\u72D7", "\u72D7", "\u732B", "\u5BA0\u7269", "\u60C5\u4FA3", "\u80CC\u666F", "\u5EFA\u7B51", "\u98DF\u7269", "\u8138", "\u8868\u60C5"];
var flawRules = [
  { flaw: "\u6709\u4EBA\u88AB\u88C1\u51FA\u753B\u9762", keywords: ["\u88C1\u6389", "\u534A\u5F20\u8138", "\u5207\u6389", "\u6CA1\u4E86", "\u88AB\u753B\u9762\u5F00\u9664"] },
  { flaw: "\u4E3B\u4F53\u592A\u5C0F", keywords: ["\u4EBA\u7269\u975E\u5E38\u5C0F", "\u4EBA\u5F88\u5C0F", "\u4E3B\u4F53\u592A\u5C0F", "\u51E0\u4E4E\u770B\u4E0D\u6E05", "\u592A\u8FDC"] },
  { flaw: "\u955C\u5934\u8DDD\u79BB\u8FC7\u8FD1", keywords: ["\u592A\u8FD1", "\u8138\u79BB\u955C\u5934", "\u7279\u5199", "\u8D34\u8138"] },
  { flaw: "\u753B\u9762\u504F\u7CCA", keywords: ["\u7CCA", "\u6A21\u7CCA", "\u865A\u7126", "\u6296"] },
  { flaw: "\u5149\u7EBF\u504F\u6697", keywords: ["\u592A\u6697", "\u504F\u6697", "\u5149\u7EBF\u5DEE", "\u660F\u6697"] },
  { flaw: "\u80CC\u666F\u62A2\u620F", keywords: ["\u80CC\u666F", "\u6742\u7269", "\u62A2\u955C", "\u4E71"] },
  { flaw: "\u8868\u60C5\u8FC7\u4E8E\u6709\u620F", keywords: ["\u8868\u60C5\u5938\u5F20", "\u8868\u60C5\u5F88\u5938\u5F20", "\u5446", "\u5C34\u5C2C", "\u653E\u7A7A", "\u59D4\u5C48"] }
];
function analyzePhotoDescription(description) {
  const text = description.trim();
  const sceneType = sceneMap.find((scene) => includesAny(text, scene.keywords))?.type ?? "\u751F\u6D3B\u7167\u7247";
  const subjects = unique(matchKeywords(text, subjectKeywords));
  const flaws = flawRules.filter((rule) => includesAny(text, rule.keywords)).map((rule) => rule.flaw);
  const visualKeywords = unique([
    ...subjects,
    ...matchKeywords(text, ["\u81EA\u62CD", "\u5408\u7167", "\u666F\u70B9", "\u5EFA\u7B51", "\u6742\u7269", "\u6697", "\u53EF\u7231", "\u59D4\u5C48", "\u5938\u5F20", "\u62E5\u6324", "\u80CC\u666F", "\u98CE\u666F"])
  ]);
  const photoQualityIssues = flaws.filter(
    (flaw) => ["\u6709\u4EBA\u88AB\u88C1\u51FA\u753B\u9762", "\u4E3B\u4F53\u592A\u5C0F", "\u955C\u5934\u8DDD\u79BB\u8FC7\u8FD1", "\u753B\u9762\u504F\u7CCA", "\u5149\u7EBF\u504F\u6697", "\u80CC\u666F\u62A2\u620F"].includes(flaw)
  );
  const funnyPoints = unique([
    ...flaws,
    ...includesAny(text, ["\u6324", "\u62E5\u6324", "\u56DB\u4E2A\u4EBA"]) ? ["\u5927\u5BB6\u6B63\u5728\u4E89\u593A\u753B\u9762\u751F\u5B58\u6743"] : [],
    ...includesAny(text, ["\u8868\u60C5\u5938\u5F20", "\u5446", "\u653E\u7A7A", "\u59D4\u5C48"]) ? ["\u8868\u60C5\u7BA1\u7406\u77ED\u6682\u79BB\u7EBF"] : []
  ]);
  const cutenessLevel = clamp(
    (includesAny(text, ["\u53EF\u7231", "\u840C", "\u4E56", "\u5C0F\u72D7", "\u5C0F\u732B", "\u5BA0\u7269"]) ? 70 : 0) + (includesAny(text, ["\u59D4\u5C48", "\u8DB4", "\u770B\u7740\u955C\u5934"]) ? 20 : 0)
  );
  const awkwardLevel = clamp(
    (includesAny(text, ["\u5C34\u5C2C", "\u5446", "\u653E\u7A7A", "\u65E0\u8BED"]) ? 75 : 0) + (includesAny(text, ["\u88C1\u6389", "\u534A\u5F20\u8138", "\u8868\u60C5\u5938\u5F20"]) ? 20 : 0)
  );
  const chaosLevel = clamp(flaws.length * 18 + (includesAny(text, ["\u591A\u4EBA", "\u56DB\u4E2A\u4EBA", "\u6324", "\u6742\u7269", "\u6DF7\u4E71"]) ? 25 : 0));
  const roastPotential = clamp(
    flaws.length * 20 + funnyPoints.length * 12 + (includesAny(text, ["\u975E\u5E38\u5C0F", "\u534A\u5F20\u8138", "\u592A\u8FD1", "\u592A\u6697", "\u7CCA", "\u62A2\u955C"]) ? 30 : 0)
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
function detectPunchline(text) {
  if (includesAny(text, ["\u4EBA\u7269\u975E\u5E38\u5C0F", "\u4EBA\u5F88\u5C0F", "\u4E3B\u4F53\u592A\u5C0F", "\u51E0\u4E4E\u770B\u4E0D\u6E05"])) return "\u4EBA\u5462\uFF1F";
  if (includesAny(text, ["\u88C1\u6389\u534A\u5F20\u8138", "\u534A\u5F20\u8138", "\u88C1\u6389"])) return "\u53F3\u8FB9\u90A3\u4F4D\uFF1A\u6211\u4E5F\u662F\u4EBA";
  if (includesAny(text, ["\u592A\u8FD1", "\u8138\u79BB\u955C\u5934", "\u8D34\u8138"])) return "\u8FD9\u4E0D\u662F\u81EA\u62CD\uFF0C\u662F\u8138\u90E8\u7279\u5199\u4E8B\u6545";
  if (includesAny(text, ["\u7CCA", "\u6A21\u7CCA", "\u865A\u7126"])) return "\u753B\u8D28\u6B63\u5728\u9003\u8DD1";
  if (includesAny(text, ["\u592A\u6697", "\u504F\u6697", "\u5149\u7EBF\u5DEE"])) return "\u706F\u5462\uFF1F";
  if (includesAny(text, ["\u80CC\u666F\u62A2\u955C", "\u6742\u7269", "\u80CC\u666F\u5F88\u4E71"])) return "\u80CC\u666F\u7533\u8BF7\u5F53\u4E3B\u89D2";
  return void 0;
}
function detectMood(text, cuteness, awkward, chaos) {
  if (cuteness >= 75) return "\u53EF\u7231";
  if (includesAny(text, ["\u6D6A\u6F2B", "\u751C", "\u60C5\u4FA3"])) return "\u6D6A\u6F2B";
  if (awkward >= 75) return "\u5C34\u5C2C";
  if (chaos >= 70) return "\u5931\u63A7";
  if (includesAny(text, ["\u9177", "\u5E05", "\u58A8\u955C"])) return "\u5F88\u9177";
  return "\u8F7B\u5FAE\u60F3\u5410\u69FD";
}

// packages/layout/src/pixelFaces.ts
var pixelFaces = {
  speechless: [
    "0011111100",
    "0100000010",
    "1001001001",
    "1000000001",
    "1001111001",
    "0100000010",
    "0011111100"
  ],
  smirk: [
    "0011111100",
    "0100000010",
    "1001000101",
    "1000000001",
    "1000111001",
    "0100000010",
    "0011111100"
  ],
  shocked: [
    "0011111100",
    "0100000010",
    "1010010101",
    "1000000001",
    "1000110001",
    "0100110010",
    "0011111100"
  ],
  heart: [
    "0011111100",
    "0100000010",
    "1011011011",
    "1011011011",
    "1000100001",
    "0100000010",
    "0011111100"
  ],
  cry: [
    "0011111100",
    "0100000010",
    "1010010101",
    "1010010101",
    "1001111001",
    "0100000010",
    "0011111100"
  ],
  cool: [
    "0011111100",
    "0100000010",
    "1011111101",
    "1001001001",
    "1000110001",
    "0100000010",
    "0011111100"
  ],
  question: [
    "0011111100",
    "0100000010",
    "1001110001",
    "1000010001",
    "1000100001",
    "0100000010",
    "0011111100"
  ]
};

// packages/layout/src/generateLayoutDocument.ts
var margin = 16;
function generateLayoutDocument(content, layoutType2, printWidthDots = 384, _skills = []) {
  if (layoutType2 === "big_text") return bigTextLayout(content, printWidthDots);
  if (layoutType2 === "pixel_expression") return pixelExpressionLayout(content, printWidthDots);
  return receiptLayout(content, printWidthDots);
}
function receiptLayout(content, widthDots) {
  const b = builder(widthDots);
  b.text(content.title, "center", 22, "bold");
  b.text(content.subtitle, "center", 18, "bold");
  b.divider("dashed");
  b.text(`\u7167\u7247\u7C7B\u578B\uFF1A${content.photoType}`, "left", 18);
  b.text(`\u73B0\u573A\u6C14\u6C1B\uFF1A${content.atmosphere}`, "left", 18);
  b.text(`AI \u5FC3\u60C5\uFF1A${content.aiMood}`, "left", 18);
  b.space(10);
  b.text("[ \u4E3B\u8981\u53D1\u73B0 ]", "center", 18, "bold");
  for (const finding of content.findings) b.text(`- ${finding}`, "left", 17);
  b.space(8);
  b.text("[ \u8BC4\u5206\u6761 ]", "center", 18, "bold");
  for (const score of content.scores) {
    b.text(`${score.label}\uFF1A${stars(score.value)}
${bar(score.value, 8)}`, "left", 16);
  }
  b.space(8);
  b.text("[ \u672C\u673A\u5410\u69FD ]", "center", 18, "bold");
  b.text(content.roast, "left", 18);
  b.space(8);
  b.text("[ \u53CB\u5584\u5EFA\u8BAE ]", "center", 18, "bold");
  b.text(content.advice, "left", 18);
  b.divider("dashed");
  b.text(`\u7ED3\u8BBA\uFF1A${content.verdict}`, "center", 19, "bold");
  b.finish();
  return b.document;
}
function bigTextLayout(content, widthDots) {
  const b = builder(widthDots);
  b.divider("thick");
  b.rotatedText({
    eyebrow: content.topLabel,
    headline: content.headline,
    subText: content.subHeadline
  });
  b.space(18);
  b.text(content.oneLineRoast, "center", 19);
  if (content.tinyAdvice) {
    b.divider("dashed");
    b.text(content.tinyAdvice, "center", 17, "bold");
  }
  b.divider("thick");
  b.finish();
  return b.document;
}
function pixelExpressionLayout(content, widthDots) {
  const b = builder(widthDots);
  b.text("[ SNAP BUDDY MOOD ]", "center", 19, "bold");
  b.space(16);
  b.pixel(pixelFaces[content.faceType], 10);
  b.space(16);
  b.text(`\u5F53\u524D\u8868\u60C5\uFF1A${content.moodLabel}`, "left", 18, "bold");
  b.text(`\u7167\u7247\u5173\u952E\u8BCD\uFF1A${content.keywords.join(" / ")}`, "left", 17);
  b.space(8);
  b.text("[ \u672C\u673A\u77ED\u8BC4 ]", "center", 18, "bold");
  b.text(content.shortComment, "center", 20);
  b.finish();
  return b.document;
}
function builder(widthDots) {
  const blocks = [];
  let y = 16;
  const contentWidth = widthDots - margin * 2;
  const document2 = {
    widthDots,
    background: "white",
    blocks
  };
  function pushText(text, align, fontSize, fontWeight = "regular", letterSpacing = 0) {
    const maxUnits = Math.max(12, Math.floor(contentWidth / (fontSize * 0.58)));
    const lines = text.split("\n").flatMap((line) => wrapText(line, maxUnits));
    const lineHeight = Math.round(fontSize * 1.35);
    blocks.push({
      type: "text",
      text: lines.join("\n"),
      x: margin,
      y,
      width: contentWidth,
      align,
      fontSize,
      fontWeight,
      letterSpacing,
      lineHeight
    });
    y += lines.length * lineHeight + 4;
  }
  return {
    document: document2,
    text: pushText,
    divider(style) {
      blocks.push({ type: "divider", x: margin, y, width: contentWidth, style });
      y += style === "thick" ? 18 : 14;
    },
    pixel(matrix, pixelSize) {
      const pixelWidth = matrix[0]?.length ?? 0;
      blocks.push({
        type: "pixel_art",
        matrix,
        x: Math.round((widthDots - pixelWidth * pixelSize) / 2),
        y,
        pixelSize
      });
      y += matrix.length * pixelSize;
    },
    rotatedText(input2) {
      const normalized = input2.headline.replace(/\s+/g, "");
      const displayText = [...normalized].join(" ");
      const fontSize = input2.subText ? 104 : 124;
      const headlineWidth = measureText(displayText, fontSize);
      const eyebrowWidth = input2.eyebrow ? measureText(input2.eyebrow, 18) : 0;
      const subTextWidth = input2.subText ? measureText(input2.subText, 26) : 0;
      const stripWidth = Math.max(300, Math.ceil(Math.max(headlineWidth, eyebrowWidth, subTextWidth) + 56));
      blocks.push({
        type: "rotated_text",
        text: displayText,
        eyebrow: input2.eyebrow,
        subText: input2.subText,
        x: margin,
        y,
        width: contentWidth,
        height: stripWidth,
        align: "center",
        fontSize,
        fontWeight: "bold",
        letterSpacing: 2
      });
      y += stripWidth;
    },
    space(height) {
      blocks.push({ type: "spacer", height });
      y += height;
    },
    finish() {
      this.document.heightDots = y + 16;
    }
  };
}
function measureText(text, fontSize) {
  return [...text].reduce((sum, char) => sum + (/[\u0000-\u00ff]/.test(char) ? fontSize * 0.58 : fontSize), 0);
}

// packages/layout/src/generateRoastContent.ts
function generateRoastContent(analysis, layoutType2, roastLevel2 = "normal", skills = [], generatedComment) {
  const skill = selectSkill(skills, layoutType2, analysis, roastLevel2);
  if (layoutType2 === "big_text") return generateBigTextContent(analysis, roastLevel2, skill, generatedComment);
  if (layoutType2 === "pixel_expression") return generatePixelExpressionContent(analysis, roastLevel2, generatedComment);
  return generateReceiptContent(analysis, roastLevel2, skill, generatedComment);
}
function generateReceiptContent(analysis, roastLevel2 = "normal", skill, generatedComment) {
  const motifs = skill?.visualMotifs?.length ? skill.visualMotifs : ["\u7167\u7247\u5BA1\u5224\u5C0F\u7968", "\u7167\u7247\u68C0\u6D4B\u5355", "\u4ECA\u65E5\u6210\u7247\u62A5\u544A"];
  const findings = buildFindings(analysis).slice(0, 4);
  return {
    title: "SNAP ROAST BUDDY",
    subtitle: choose(motifs, analysis.sceneType),
    photoType: analysis.sceneType,
    atmosphere: analysis.chaosLevel >= 65 ? "\u70ED\u95F9\u4F46\u6709\u70B9\u5931\u63A7" : analysis.mood === "\u53EF\u7231" ? "\u53EF\u7231\u503C\u8D85\u6807" : "\u52AA\u529B\u8425\u4E1A\u4E2D",
    aiMood: roastLevel2 === "spicy" ? "\u5DF2\u7ECF\u5F00\u59CB\u618B\u5927\u62DB" : analysis.mood === "\u53EF\u7231" ? "\u88AB\u53EF\u7231\u51FB\u4E2D" : "\u6B63\u5728\u618B\u7B11",
    findings,
    scores: [
      { label: "\u79BB\u8C31\u6307\u6570", value: Math.max(35, analysis.roastPotential) },
      { label: "\u6784\u56FE\u5B89\u5168", value: 100 - Math.min(80, analysis.photoQualityIssues.length * 22 + analysis.chaosLevel / 3) },
      { label: "\u53EF\u53D1\u7A0B\u5EA6", value: Math.max(30, 82 - analysis.photoQualityIssues.length * 13 + analysis.cutenessLevel / 5) }
    ],
    roast: generatedComment?.trim() || receiptRoast(analysis, roastLevel2),
    advice: adviceFor(analysis),
    verdict: verdictFor(analysis, roastLevel2)
  };
}
function generateBigTextContent(analysis, roastLevel2 = "normal", skill, generatedComment) {
  const motifs = skill?.visualMotifs?.length ? skill.visualMotifs : [">>> \u7D27\u6025\u64AD\u62A5 <<<", "!!! \u6784\u56FE\u8B66\u544A !!!", ">>> \u73B0\u573A\u5224\u5B9A <<<", "=== \u672C\u673A\u9707\u60CA ==="];
  const punchline = analysis.strongestPunchline ?? choose(["\u4E3B\u4F53\u5931\u8E2A", "\u753B\u9762\u6709\u60C5\u51B5", "\u672C\u673A\u6682\u505C\u601D\u8003"], analysis.sceneType);
  const headline = headlineFromPunchline(punchline);
  return {
    topLabel: choose(motifs, punchline),
    headline,
    subHeadline: punchline.includes("\uFF1A") ? punchline.split("\uFF1A")[0] : void 0,
    oneLineRoast: generatedComment?.trim() || oneLineRoastFor(analysis, roastLevel2),
    tinyAdvice: adviceFor(analysis, true)
  };
}
function generatePixelExpressionContent(analysis, roastLevel2 = "normal", generatedComment) {
  const faceType = faceFor(analysis);
  return {
    faceType,
    moodLabel: moodLabelFor(faceType, analysis),
    keywords: (analysis.visualKeywords.length ? analysis.visualKeywords : [analysis.sceneType, analysis.mood]).slice(0, 4),
    shortComment: generatedComment?.trim() || pixelCommentFor(analysis, faceType, roastLevel2)
  };
}
function buildFindings(analysis) {
  const findings = analysis.funnyPoints.map((point) => {
    if (point === "\u6709\u4EBA\u88AB\u88C1\u51FA\u753B\u9762") return "\u8FB9\u7F18\u670B\u53CB\u53EA\u83B7\u5F97\u90E8\u5206\u51FA\u573A\u8BB8\u53EF";
    if (point === "\u4E3B\u4F53\u592A\u5C0F") return "\u4E3B\u89D2\u6B63\u5728\u548C\u80CC\u666F\u73A9\u8EB2\u732B\u732B";
    if (point === "\u80CC\u666F\u62A2\u620F") return "\u80CC\u666F\u6B63\u5728\u79EF\u6781\u7533\u8BF7\u4E3B\u89D2\u4F4D";
    if (point === "\u5149\u7EBF\u504F\u6697") return "\u5149\u7EBF\u504F\u6697\uFF0C\u4F46\u6C14\u6C1B\u5F88\u52AA\u529B";
    if (point === "\u8868\u60C5\u8FC7\u4E8E\u6709\u620F") return "\u8868\u60C5\u7BA1\u7406\u5DF2\u8FDB\u5165\u7EFC\u827A\u9891\u9053";
    return point;
  });
  if (!findings.length) findings.push("\u753B\u9762\u6574\u4F53\u8FD8\u7B97\u7A33\u5B9A\uFF0C\u4F46\u672C\u673A\u4ECD\u7136\u53D1\u73B0\u4E86\u5410\u69FD\u7A7A\u95F4");
  return findings;
}
function receiptRoast(analysis, roastLevel2) {
  if (analysis.flaws.includes("\u6709\u4EBA\u88AB\u88C1\u51FA\u753B\u9762")) {
    return "\u8FD9\u5F20\u7167\u7247\u50CF\u4E00\u573A\u53CB\u60C5\u751F\u5B58\u6311\u6218\uFF0C\n\u6BCF\u4E2A\u4EBA\u90FD\u5728\u52AA\u529B\u6324\u8FDB\u5386\u53F2\u3002";
  }
  if (analysis.flaws.includes("\u4E3B\u4F53\u592A\u5C0F")) {
    return "\u98CE\u666F\u975E\u5E38\u6210\u529F\uFF0C\n\u4E3B\u89D2\u5219\u9009\u62E9\u4F4E\u8C03\u5230\u63A5\u8FD1\u9690\u8EAB\u3002";
  }
  if (analysis.cutenessLevel >= 75) {
    return "\u672C\u673A\u539F\u672C\u51C6\u5907\u5410\u69FD\uFF0C\n\u4F46\u53EF\u7231\u7A0B\u5EA6\u5BFC\u81F4\u5BA1\u5224\u6D41\u7A0B\u4E2D\u65AD\u3002";
  }
  if (roastLevel2 === "spicy") {
    return "\u8FD9\u5F20\u7167\u7247\u4E0D\u662F\u5931\u8BEF\uFF0C\n\u662F\u5BF9\u6444\u5F71\u89C4\u5219\u7684\u4E00\u6B21\u516C\u5F00\u6311\u6218\u3002";
  }
  return "\u8FD9\u5F20\u7167\u7247\u7684\u4F18\u70B9\u662F\u5F88\u771F\u5B9E\uFF0C\n\u7F3A\u70B9\u662F\u771F\u5B9E\u5F97\u6709\u70B9\u592A\u52AA\u529B\u3002";
}
function oneLineRoastFor(analysis, roastLevel2) {
  if (analysis.flaws.includes("\u4E3B\u4F53\u592A\u5C0F")) return "\u672C\u673A\u627E\u4E86\u534A\u5929\uFF0C\n\u7EC8\u4E8E\u5728\u98CE\u666F\u91CC\u53D1\u73B0\u4E86\u4F60\u3002";
  if (analysis.flaws.includes("\u6709\u4EBA\u88AB\u88C1\u51FA\u753B\u9762")) return "\u8BF7\u786E\u8BA4\u670B\u53CB\u6CA1\u6709\u88AB\u753B\u9762\u5F00\u9664\u3002";
  if (analysis.flaws.includes("\u955C\u5934\u8DDD\u79BB\u8FC7\u8FD1")) return "\u955C\u5934\u8BF4\uFF1A\u6211\u6709\u70B9\u5BB3\u6015\u3002";
  if (analysis.flaws.includes("\u753B\u9762\u504F\u7CCA")) return "\u8FD9\u4E00\u523B\u5F88\u73CD\u8D35\uFF0C\n\u53EF\u60DC\u753B\u8D28\u5148\u64A4\u9000\u4E86\u3002";
  if (analysis.flaws.includes("\u5149\u7EBF\u504F\u6697")) return "\u6C14\u6C1B\u5230\u4E86\uFF0C\n\u706F\u5149\u8FD8\u5728\u8DEF\u4E0A\u3002";
  return roastLevel2 === "spicy" ? "\u672C\u673A\u77ED\u6682\u6C89\u9ED8\uFF0C\n\u7136\u540E\u9009\u62E9\u6253\u5370\u8BC1\u636E\u3002" : "\u8FD9\u5F20\u5F88\u6709\u8BB0\u5FC6\u70B9\uFF0C\n\u4E3B\u8981\u662F\u56E0\u4E3A\u5B83\u5F88\u96BE\u5FD8\u3002";
}
function adviceFor(analysis, tiny = false) {
  const prefix = tiny ? "\u5EFA\u8BAE\uFF1A" : "";
  if (analysis.flaws.includes("\u4E3B\u4F53\u592A\u5C0F")) return `${prefix}\u4E0B\u6B21\u8BA9\u4E3B\u89D2\u7A0D\u5FAE\u5927\u4E8E\u8682\u8681`;
  if (analysis.flaws.includes("\u6709\u4EBA\u88AB\u88C1\u51FA\u753B\u9762")) return `${prefix}\u624B\u673A\u62FF\u8FDC\u4E00\u70B9\uFF0C\u7ED9\u6BCF\u4F4D\u670B\u53CB\u5B8C\u6574\u51FA\u573A\u673A\u4F1A\u3002`;
  if (analysis.flaws.includes("\u5149\u7EBF\u504F\u6697")) return `${prefix}\u8865\u4E00\u70B9\u5149\uFF0C\u522B\u8BA9\u6C14\u6C1B\u72EC\u81EA\u4E0A\u73ED\u3002`;
  if (analysis.flaws.includes("\u753B\u9762\u504F\u7CCA")) return `${prefix}\u6309\u5FEB\u95E8\u524D\u5148\u7A33\u4F4F\uFF0C\u522B\u8BA9\u56DE\u5FC6\u4EA7\u751F\u91CD\u5F71\u3002`;
  if (analysis.flaws.includes("\u80CC\u666F\u62A2\u620F")) return `${prefix}\u6362\u4E2A\u5E72\u51C0\u80CC\u666F\uFF0C\u8BA9\u4E3B\u89D2\u91CD\u65B0\u593A\u56DE\u4E3B\u573A\u3002`;
  return `${prefix}\u4FDD\u7559\u8FD9\u5F20\uFF0C\u4F46\u53EF\u4EE5\u518D\u62CD\u4E00\u5F20\u5F53\u4FDD\u9669\u3002`;
}
function verdictFor(analysis, roastLevel2) {
  if (analysis.cutenessLevel >= 75) return "\u4E0D\u8BB8\u5220\uFF0C\u672C\u673A\u6279\u51C6\u6536\u85CF";
  if (analysis.roastPotential >= 80) return roastLevel2 === "spicy" ? "\u5EFA\u8BAE\u53D1\uFF0C\u4F46\u8BF7\u51C6\u5907\u89E3\u91CA\u6743" : "\u53EF\u53D1\uFF0C\u4F46\u9700\u8981\u914D\u6587\u72E1\u8FA9";
  return "\u53EF\u53D1\uFF0C\u8F7B\u5FAE\u52A0\u5DE5\u540E\u66F4\u7A33";
}
function headlineFromPunchline(punchline) {
  if (punchline.includes("\u4EBA\u5462")) return "\u4EBA \u5462 \uFF1F";
  if (punchline.includes("\u6211\u4E5F\u662F\u4EBA")) return "\u6211 \u4E5F \u662F \u4EBA";
  if (punchline.includes("\u80CC\u666F")) return "\u80CC \u666F \u4E0A \u4F4D";
  if (punchline.includes("\u706F")) return "\u706F \u5462 \uFF1F";
  if (punchline.includes("\u753B\u8D28")) return "\u753B \u8D28 \u51FA \u8D70";
  return punchline.length <= 6 ? punchline : punchline.slice(0, 6);
}
function faceFor(analysis) {
  if (analysis.cutenessLevel >= 75) return "heart";
  if (analysis.flaws.includes("\u753B\u9762\u504F\u7CCA")) return "cry";
  if (analysis.mood === "\u5F88\u9177") return "cool";
  if (analysis.awkwardLevel >= 75) return "speechless";
  if (analysis.roastPotential >= 80) return "shocked";
  if (analysis.flaws.length === 0) return "smirk";
  return "question";
}
function moodLabelFor(faceType, analysis) {
  const labels = {
    speechless: "\u7075\u9B42\u52A0\u8F7D\u5931\u8D25",
    smirk: "\u618B\u7B11",
    shocked: "\u672C\u673A\u9707\u60CA",
    heart: "\u88AB\u53EF\u7231\u51FB\u4E2D",
    cry: "\u753B\u8D28\u54ED\u54ED",
    cool: "\u9177\u5230\u70B9\u5934",
    question: "\u95EE\u53F7\u8138"
  };
  return analysis.mood === "\u6D6A\u6F2B" ? "\u751C\u5EA6\u8D85\u6807" : labels[faceType];
}
function pixelCommentFor(analysis, faceType, roastLevel2) {
  if (faceType === "heart") return "\u8FD9\u5F20\u4E0D\u8BB8\u5220\u3002\n\u672C\u673A\u6279\u51C6\u6536\u85CF\u3002";
  if (faceType === "cry") return "\u672C\u4EBA\u8FD8\u5728\uFF0C\n\u6E05\u6670\u5EA6\u53EF\u80FD\u521A\u521A\u6389\u7EBF\u4E86\u3002";
  if (faceType === "speechless") return "\u8FD9\u4E0D\u662F\u5408\u7167\uFF0C\n\u8FD9\u662F\u53CB\u60C5\u751F\u5B58\u6311\u6218\u3002";
  if (faceType === "shocked") return "\u672C\u673A\u770B\u5230\u8FD9\u91CC\uFF0C\n\u5904\u7406\u5668\u8F7B\u8F7B\u53F9\u4E86\u53E3\u6C14\u3002";
  if (roastLevel2 === "gentle") return "\u6709\u70B9\u597D\u7B11\uFF0C\n\u4F46\u8FD8\u633A\u53EF\u7231\u3002";
  return "\u672C\u673A\u77ED\u8BC4\uFF1A\n\u753B\u9762\u5F88\u52AA\u529B\uFF0C\u6548\u679C\u5F88\u6709\u620F\u3002";
}

// packages/layout/src/renderSvgPreview.ts
function renderSvgPreview(layout) {
  const height = layout.heightDots ?? estimateHeight(layout);
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.widthDots}" height="${height}" viewBox="0 0 ${layout.widthDots} ${height}">`,
    `<rect width="100%" height="100%" fill="#fff"/>`
  ];
  for (const block of layout.blocks) {
    if (block.type === "divider") {
      const strokeWidth = block.style === "thick" ? 4 : block.style === "double" ? 2 : 1.5;
      const dash = block.style === "dashed" ? ` stroke-dasharray="8 6"` : "";
      parts.push(
        `<line x1="${block.x}" y1="${block.y}" x2="${block.x + block.width}" y2="${block.y}" stroke="#000" stroke-width="${strokeWidth}"${dash}/>`
      );
      if (block.style === "double") {
        parts.push(
          `<line x1="${block.x}" y1="${block.y + 5}" x2="${block.x + block.width}" y2="${block.y + 5}" stroke="#000" stroke-width="2"/>`
        );
      }
      continue;
    }
    if (block.type === "pixel_art") {
      block.matrix.forEach((row, rowIndex) => {
        [...row].forEach((cell, columnIndex) => {
          if (cell !== "1") return;
          parts.push(
            `<rect x="${block.x + columnIndex * block.pixelSize}" y="${block.y + rowIndex * block.pixelSize}" width="${block.pixelSize}" height="${block.pixelSize}" fill="#000"/>`
          );
        });
      });
      continue;
    }
    if (block.type === "barcode_like") {
      const pattern = block.pattern ?? [2, 4, 1, 3, 3, 1, 5, 2, 1, 4, 2, 2];
      let x = block.x;
      pattern.forEach((barWidth, index) => {
        if (index % 2 === 0) parts.push(`<rect x="${x}" y="${block.y}" width="${barWidth}" height="${block.height}" fill="#000"/>`);
        x += barWidth + 2;
      });
      continue;
    }
    if (block.type === "text") {
      const anchor = block.align === "center" ? "middle" : block.align === "right" ? "end" : "start";
      const x = block.align === "center" ? block.x + block.width / 2 : block.align === "right" ? block.x + block.width : block.x;
      const weight = block.fontWeight === "bold" ? 700 : 400;
      const lineHeight = block.lineHeight ?? Math.round(block.fontSize * 1.35);
      block.text.split("\n").forEach((line, index) => {
        parts.push(
          `<text x="${x}" y="${block.y + index * lineHeight + block.fontSize}" text-anchor="${anchor}" font-family="monospace, 'Microsoft YaHei', sans-serif" font-size="${block.fontSize}" font-weight="${weight}" letter-spacing="${block.letterSpacing ?? 0}" fill="#000">${escapeXml(line)}</text>`
        );
      });
    }
    if (block.type === "rotated_text") {
      const weight = block.fontWeight === "bold" ? 900 : 400;
      const textY = block.width / 2;
      parts.push(
        `<g transform="translate(${block.x + block.width} ${block.y}) rotate(90)">`,
        block.eyebrow ? `<text x="22" y="38" text-anchor="start" font-family="'Microsoft YaHei', 'SimHei', monospace, sans-serif" font-size="18" font-weight="700" letter-spacing="1" fill="#000">${escapeXml(block.eyebrow)}</text>` : "",
        `<text x="22" y="${textY}" dominant-baseline="middle" text-anchor="start" font-family="'Microsoft YaHei', 'SimHei', monospace, sans-serif" font-size="${block.fontSize}" font-weight="${weight}" letter-spacing="${block.letterSpacing ?? 0}" fill="#000">${escapeXml(block.text)}</text>`,
        block.subText ? `<text x="24" y="${block.width - 34}" text-anchor="start" font-family="'Microsoft YaHei', 'SimHei', monospace, sans-serif" font-size="26" font-weight="800" letter-spacing="1" fill="#000">${escapeXml(block.subText)}</text>` : "",
        `</g>`
      );
    }
  }
  parts.push("</svg>");
  return parts.join("");
}
function estimateHeight(layout) {
  return layout.blocks.reduce((height, block) => {
    if ("y" in block) return Math.max(height, block.y + ("height" in block ? block.height : 40));
    return height + block.height;
  }, 64);
}
function escapeXml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// packages/layout/src/renderTextPreview.ts
var previewColumns = 24;
function renderTextPreview(layout) {
  const lines = [];
  for (const block of layout.blocks) {
    if (block.type === "spacer") {
      lines.push("");
      continue;
    }
    if (block.type === "divider") {
      const char = block.style === "dashed" ? "-" : "=";
      lines.push(char.repeat(previewColumns));
      continue;
    }
    if (block.type === "pixel_art") {
      for (const row of block.matrix) {
        const rendered = [...row].map((cell) => cell === "1" ? "\u2588\u2588" : "  ").join("");
        lines.push(centerText(rendered.trimEnd(), previewColumns));
      }
      continue;
    }
    if (block.type === "barcode_like") {
      lines.push("|||| ||| || |||| |||");
      continue;
    }
    if (block.type === "rotated_text") {
      lines.push(centerText("[ \u56FA\u5B9A\u9AD8\u5EA6\u6A2A\u5E45 -> \u65CB\u8F6C 90\xB0 ]", previewColumns));
      lines.push("");
      if (block.eyebrow) lines.push(centerText(block.eyebrow, previewColumns));
      lines.push(centerText(block.text, previewColumns));
      if (block.subText) lines.push(centerText(block.subText, previewColumns));
      lines.push("");
      continue;
    }
    const maxUnits = block.fontSize >= 34 ? 12 : block.fontSize >= 20 ? 18 : previewColumns * 2;
    for (const rawLine of block.text.split("\n")) {
      for (const line of wrapText(rawLine, maxUnits)) {
        lines.push(block.align === "center" ? centerText(line, previewColumns) : line);
      }
    }
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// packages/layout/src/selectLayoutType.ts
function selectLayoutType(analysis, userMode = "auto") {
  if (userMode !== "auto") return userMode;
  const isRichScene = analysis.funnyPoints.length >= 3 || analysis.flaws.length >= 3;
  if (isRichScene && analysis.sceneType !== "\u65C5\u884C\u6253\u5361") {
    return "receipt";
  }
  if (analysis.strongestPunchline && analysis.roastPotential >= 75) {
    return "big_text";
  }
  if (analysis.cutenessLevel >= 75 || analysis.awkwardLevel >= 75 || ["\u53EF\u7231", "\u5C34\u5C2C", "\u9707\u60CA", "\u65E0\u8BED", "\u6D6A\u6F2B"].includes(analysis.mood)) {
    return "pixel_expression";
  }
  return "receipt";
}
function explainLayoutChoice(analysis, layoutType2) {
  if (layoutType2 === "big_text") {
    return `\u7167\u7247\u5B58\u5728\u660E\u786E\u7206\u70B9\u300C${analysis.strongestPunchline ?? analysis.funnyPoints[0] ?? "\u5F3A\u70C8\u69FD\u70B9"}\u300D\uFF0C\u9002\u5408\u7528\u6A2A\u5411\u5927\u5B57\u505A\u7B2C\u4E00\u773C\u7B11\u70B9\u3002`;
  }
  if (layoutType2 === "pixel_expression") {
    return `\u7167\u7247\u60C5\u7EEA\u5F88\u660E\u786E\uFF08${analysis.mood}\uFF09\uFF0C\u7528\u50CF\u7D20\u8868\u60C5\u80FD\u5F3A\u5316\u8BBE\u5907\u88AB\u7167\u7247\u523A\u6FC0\u5230\u7684\u89D2\u8272\u611F\u3002`;
  }
  if (layoutType2 === "pixel_doodle") {
    return "\u7167\u7247\u9002\u5408\u8F6C\u6210\u53EF\u7231\u50CF\u7D20\u7B80\u7B14\u753B\uFF0C\u8F93\u51FA\u4F1A\u8C03\u7528\u56FE\u50CF\u7F16\u8F91\u6A21\u578B\u751F\u6210\u8D34\u7EB8\u611F\u56FE\u50CF\u3002";
  }
  return "\u753B\u9762\u4FE1\u606F\u8F83\u591A\uFF0C\u6709\u591A\u4E2A\u53EF\u70B9\u8BC4\u5143\u7D20\uFF0C\u9002\u5408\u751F\u6210\u4E00\u5F20\u5E26\u5C42\u7EA7\u7684\u7167\u7247\u5BA1\u5224\u5C0F\u7968\u3002";
}

// packages/layout/src/generateRoastLayoutWithSkills.ts
function generateRoastLayoutWithSkills(input2, skills = []) {
  const printWidthDots = input2.printWidthDots ?? 384;
  const analysis = analyzePhotoDescription(input2.photoDescription);
  const layoutType2 = selectLayoutType(analysis, input2.mode ?? "auto");
  const content = generateRoastContent(analysis, layoutType2, input2.roastLevel ?? "normal", skills, input2.generatedComment);
  const layoutJson = generateLayoutDocument(content, layoutType2, printWidthDots, skills);
  return {
    layoutType: layoutType2,
    textPreview: renderTextPreview(layoutJson),
    layoutJson: input2.returnLayoutJson === false ? { ...layoutJson, blocks: [] } : layoutJson,
    renderResult: {
      svg: renderSvgPreview(layoutJson)
    },
    reason: explainLayoutChoice(analysis, layoutType2)
  };
}

// frontend/src/app.ts
var layoutSkills = [
  {
    name: "receipt_default",
    layoutType: "receipt",
    tone: "normal",
    triggerKeywords: ["\u81EA\u62CD", "\u5408\u7167", "\u805A\u4F1A", "\u7F8E\u98DF", "\u65C5\u884C", "\u5BA0\u7269", "\u6742\u7269", "\u5149\u7EBF"],
    visualMotifs: ["\u4ECA\u65E5\u7167\u7247\u5BA1\u5224\u5C0F\u7968", "\u670B\u53CB\u5408\u7167\u68C0\u6D4B\u5355", "AI \u6210\u7247\u4F53\u68C0\u62A5\u544A"]
  },
  {
    name: "big_text_variety_show",
    layoutType: "big_text",
    tone: "normal",
    triggerKeywords: ["\u7CCA", "\u88C1\u6389", "\u592A\u8FD1", "\u592A\u8FDC", "\u4E3B\u4F53\u4E0D\u660E", "\u80CC\u666F\u62A2\u620F", "\u79BB\u8C31", "\u975E\u5E38\u5C0F"],
    visualMotifs: [">>> \u7D27\u6025\u64AD\u62A5 <<<", "!!! \u6784\u56FE\u8B66\u544A !!!", ">>> \u73B0\u573A\u5224\u5B9A <<<", "=== \u53CB\u60C5\u4E8B\u6545 ==="]
  },
  {
    name: "pixel_expression_default",
    layoutType: "pixel_expression",
    tone: "normal",
    triggerKeywords: ["\u53EF\u7231", "\u5C34\u5C2C", "\u9707\u60CA", "\u65E0\u8BED", "\u6D6A\u6F2B", "\u59D4\u5C48", "\u5446", "\u5C0F\u72D7", "\u5C0F\u732B"],
    visualMotifs: ["SNAP BUDDY MOOD", "BUDDY FACE", "AI \u5FC3\u60C5\u5361\u7247"]
  },
  {
    name: "pixel_doodle_default",
    layoutType: "pixel_doodle",
    tone: "normal",
    triggerKeywords: ["\u53EF\u7231", "\u5BA0\u7269", "\u5C0F\u72D7", "\u5C0F\u732B", "\u73A9\u5177", "\u7269\u54C1", "\u8D34\u7EB8", "\u7B80\u7B14\u753B"],
    visualMotifs: ["\u9ED1\u767D\u4E8C\u503C\u7EBF\u7A3F", "\u53EF\u7231\u6F2B\u753B\u8D34\u7EB8", "\u70ED\u654F\u7EB8\u63D2\u753B"]
  }
];
var textExamples = [
  {
    name: "\u670B\u53CB\u805A\u4F1A\u81EA\u62CD",
    text: "\u4E00\u5F20\u670B\u53CB\u805A\u4F1A\u81EA\u62CD\uFF0C\u56DB\u4E2A\u4EBA\u6324\u5728\u753B\u9762\u91CC\uFF0C\u53F3\u8FB9\u7684\u4EBA\u88AB\u88C1\u6389\u534A\u5F20\u8138\uFF0C\u4E2D\u95F4\u7684\u4EBA\u8868\u60C5\u5F88\u5938\u5F20\uFF0C\u80CC\u666F\u6709\u5F88\u591A\u6742\u7269\uFF0C\u5149\u7EBF\u504F\u6697\u3002"
  },
  {
    name: "\u666F\u70B9\u4E3B\u4F53\u5931\u8E2A",
    text: "\u4E00\u4E2A\u4EBA\u7AD9\u5728\u666F\u70B9\u524D\u62CD\u7167\uFF0C\u4F46\u662F\u4EBA\u7269\u975E\u5E38\u5C0F\uFF0C\u80CC\u666F\u5EFA\u7B51\u5F88\u5927\uFF0C\u4EBA\u7269\u51E0\u4E4E\u770B\u4E0D\u6E05\u3002"
  },
  {
    name: "\u59D4\u5C48\u5C0F\u72D7",
    text: "\u4E00\u5F20\u5C0F\u72D7\u8DB4\u5728\u5730\u4E0A\u7684\u7167\u7247\uFF0C\u5B83\u770B\u7740\u955C\u5934\uFF0C\u8868\u60C5\u5F88\u59D4\u5C48\uFF0C\u753B\u9762\u5F88\u53EF\u7231\u3002"
  },
  {
    name: "\u7CCA\u6389\u7684\u591C\u62CD",
    text: "\u4E00\u5F20\u591C\u665A\u8857\u8FB9\u81EA\u62CD\uFF0C\u706F\u5149\u5F88\u6697\uFF0C\u753B\u9762\u6709\u70B9\u7CCA\uFF0C\u670B\u53CB\u7684\u624B\u6B63\u5728\u6325\u52A8\uFF0C\u80CC\u666F\u9713\u8679\u6BD4\u4EBA\u8FD8\u62A2\u773C\u3002"
  },
  {
    name: "\u5C34\u5C2C\u8868\u60C5\u5305",
    text: "\u4E00\u5F20\u5BA4\u5185\u751F\u6D3B\u7167\uFF0C\u4E00\u4E2A\u4EBA\u770B\u7740\u955C\u5934\u8868\u60C5\u5F88\u5446\uFF0C\u50CF\u7A81\u7136\u88AB\u70B9\u540D\uFF0C\u684C\u9762\u6709\u96F6\u98DF\u888B\u548C\u676F\u5B50\uFF0C\u6C14\u6C1B\u6709\u70B9\u5C34\u5C2C\u3002"
  }
];
var imageExamples = [
  {
    name: "\u793A\u4F8B\u56FE A",
    url: "https://sf-maas-uat-prod.oss-cn-shanghai.aliyuncs.com/suggestion/lbygavkzjykewmmpnzfutkvedlowunms.png"
  },
  {
    name: "\u5C0F\u72D7",
    url: "https://images.unsplash.com/photo-1517849845537-4d257902454a?auto=format&fit=crop&w=900&q=80"
  },
  {
    name: "\u65C5\u884C\u6253\u5361",
    url: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80"
  }
];
var input = mustQuery("#photoDescription");
var mode = mustQuery("#mode");
var roastLevel = mustQuery("#roastLevel");
var imageUpload = mustQuery("#imageUpload");
var imageExamplesEl = mustQuery("#imageExamples");
var imagePreview = mustQuery("#imagePreview");
var analyzeImageButton = mustQuery("#analyzeImageButton");
var classifyButton = mustQuery("#classifyButton");
var generateButton = mustQuery("#generateButton");
var examplesEl = mustQuery("#examples");
var receiptPaper = mustQuery("#receiptPaper");
var doodleStage = mustQuery("#doodleStage");
var doodleImage = mustQuery("#doodleImage");
var doodleStatus = mustQuery("#doodleStatus");
var textPreview = mustQuery("#textPreview");
var layoutType = mustQuery("#layoutType");
var reason = mustQuery("#reason");
var heightReadout = mustQuery("#heightReadout");
var apiStatus = mustQuery("#apiStatus");
var aiCommentEl = mustQuery("#aiComment");
var imageStatus = mustQuery("#imageStatus");
var classificationType = mustQuery("#classificationType");
var classificationConfidence = mustQuery("#classificationConfidence");
var classificationReason = mustQuery("#classificationReason");
var classificationStatus = mustQuery("#classificationStatus");
var inputUpdateTimer = 0;
var selectedImageUrl = "";
var selectedImageDataUrl = "";
var latestAiComment = "";
var latestEnhancedDescription = "";
var classifiedLayoutType;
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
  classifiedLayoutType = void 0;
  renderClassification();
  renderLocal();
  if (mode.value === "pixel_doodle") {
    setStepStatus(classificationStatus, "\u50CF\u7D20\u7B80\u7B14\u753B\u4F1A\u76F4\u63A5\u4ECE\u56FE\u7247\u751F\u6210\uFF0C\u4E0D\u9700\u8981\u6587\u672C\u5206\u7C7B\u3002", "ready");
  }
});
roastLevel.addEventListener("change", renderLocal);
async function analyzeImage() {
  const imagePayload = selectedImageDataUrl || selectedImageUrl;
  if (!imagePayload) {
    setStepStatus(imageStatus, "\u8BF7\u5148\u4E0A\u4F20\u56FE\u7247\u6216\u9009\u62E9\u793A\u4F8B\u56FE\u7247\u3002", "error");
    return;
  }
  setBusy(analyzeImageButton, true, "\u6B63\u5728\u5206\u6790\u56FE\u7247...");
  setStepStatus(imageStatus, "\u6B63\u5728\u8C03\u7528\u89C6\u89C9\u6A21\u578B\u5206\u6790\u56FE\u7247\uFF0C\u8BF7\u7A0D\u7B49\u3002", "loading");
  setStatus("\u6B65\u9AA4 1\uFF1A\u6B63\u5728\u8C03\u7528\u89C6\u89C9\u6A21\u578B\u5206\u6790\u56FE\u7247\u3002", "loading");
  try {
    const response = await fetch("/api/analyze-image", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(selectedImageDataUrl ? { imageDataUrl: selectedImageDataUrl } : { imageUrl: selectedImageUrl })
    });
    const payload = await response.json();
    if (!response.ok || payload.error) throw new Error(formatApiError(payload, "\u56FE\u7247\u5206\u6790\u5931\u8D25\u3002"));
    input.value = payload.photoDescription?.trim() || input.value;
    resetGeneratedState();
    setStepStatus(imageStatus, "\u56FE\u7247\u5206\u6790\u5B8C\u6210\uFF0C\u63CF\u8FF0\u5DF2\u586B\u5165\u6587\u672C\u6846\u3002", "ready");
    setStepStatus(classificationStatus, "\u53EF\u4EE5\u8FDB\u884C\u4E09\u5206\u7C7B\u3002", "ready");
    setStatus("\u6B65\u9AA4 1 \u5B8C\u6210\uFF1A\u5DF2\u5F97\u5230\u56FE\u7247\u63CF\u8FF0\uFF0C\u53EF\u4EE5\u7EE7\u7EED\u4E09\u5206\u7C7B\u3002", "ready");
    renderLocal();
  } catch (error) {
    const message = error instanceof Error ? error.message : "\u56FE\u7247\u5206\u6790\u5931\u8D25\u3002";
    setStepStatus(imageStatus, message, "error");
    setStatus(message, "error");
  } finally {
    setBusy(analyzeImageButton, false, "\u5206\u6790\u56FE\u7247\u5185\u5BB9");
  }
}
async function classifyDescription() {
  if (mode.value === "pixel_doodle") {
    classifiedLayoutType = "pixel_doodle";
    classificationReason.textContent = "\u50CF\u7D20\u7B80\u7B14\u753B\u662F\u56FE\u7247\u5230\u56FE\u7247\u7684\u76F4\u63A5\u751F\u6210\u6A21\u5F0F\uFF0C\u4E0D\u9700\u8981\u5148\u8F6C\u6587\u672C\u6216\u5206\u7C7B\u3002";
    classificationConfidence.textContent = "direct";
    setStepStatus(classificationStatus, "\u5DF2\u9009\u62E9\u56FE\u7247\u76F4\u51FA\u6A21\u5F0F\u3002", "ready");
    renderClassification();
    renderLocal();
    return classifiedLayoutType;
  }
  const photoDescription = input.value.trim();
  if (!photoDescription) {
    setStepStatus(classificationStatus, "\u8BF7\u5148\u8F93\u5165\u6216\u5206\u6790\u5F97\u5230\u56FE\u7247\u63CF\u8FF0\u3002", "error");
    return;
  }
  if (mode.value !== "auto") {
    classifiedLayoutType = mode.value;
    classificationReason.textContent = "\u5F53\u524D\u4E3A\u5F3A\u5236\u6A21\u5F0F\uFF0C\u76F4\u63A5\u4F7F\u7528\u7528\u6237\u9009\u62E9\u7684\u6392\u7248\u3002";
    classificationConfidence.textContent = "manual";
    setStepStatus(classificationStatus, "\u5DF2\u4F7F\u7528\u5F3A\u5236\u6A21\u5F0F\u3002", "ready");
    renderClassification();
    renderLocal();
    return classifiedLayoutType;
  }
  setBusy(classifyButton, true, "\u6B63\u5728\u5206\u7C7B...");
  setStepStatus(classificationStatus, "\u6B63\u5728\u8C03\u7528\u6A21\u578B\u8FDB\u884C\u4E09\u5206\u7C7B\u3002", "loading");
  setStatus("\u6B65\u9AA4 2\uFF1A\u6B63\u5728\u628A\u63CF\u8FF0\u5206\u7C7B\u5230\u4E09\u79CD\u6587\u5B57\u6392\u7248\u3002", "loading");
  try {
    const response = await fetch("/api/classify-layout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ photoDescription })
    });
    const payload = await response.json();
    if (!response.ok || payload.error || !payload.layoutType) {
      throw new Error(formatApiError(payload, "\u6392\u7248\u5206\u7C7B\u5931\u8D25\u3002"));
    }
    classifiedLayoutType = payload.layoutType;
    classificationReason.textContent = payload.reason || "\u5DF2\u5B8C\u6210\u5206\u7C7B\u3002";
    classificationConfidence.textContent = typeof payload.confidence === "number" ? payload.confidence.toFixed(2) : "-";
    setStepStatus(classificationStatus, "\u4E09\u5206\u7C7B\u5B8C\u6210\u3002", "ready");
    setStatus("\u6B65\u9AA4 2 \u5B8C\u6210\uFF1A\u5DF2\u9009\u62E9\u6392\u7248\u7C7B\u578B\u3002", "ready");
    renderClassification();
    renderLocal();
    return classifiedLayoutType;
  } catch (error) {
    classifiedLayoutType = void 0;
    const message = error instanceof Error ? error.message : "\u6392\u7248\u5206\u7C7B\u5931\u8D25\u3002";
    classificationReason.textContent = message;
    classificationConfidence.textContent = "-";
    setStepStatus(classificationStatus, message, "error");
    setStatus("\u5206\u7C7B\u5931\u8D25\uFF0C\u5F53\u524D\u56DE\u9000\u672C\u5730\u81EA\u52A8\u5224\u65AD\u3002", "error");
    renderClassification();
    renderLocal();
    return void 0;
  } finally {
    setBusy(classifyButton, false, "\u8FDB\u884C\u4E09\u5206\u7C7B");
  }
}
async function generateWithApi() {
  if (mode.value === "pixel_doodle" || classifiedLayoutType === "pixel_doodle") {
    setBusy(generateButton, true, "\u6B63\u5728\u751F\u6210\u7EBF\u7A3F...");
    setStatus("\u6B63\u5728\u76F4\u63A5\u4ECE\u56FE\u7247\u751F\u6210\u9ED1\u767D\u4E8C\u503C\u6F2B\u753B\u7EBF\u7A3F\u3002", "loading");
    await generateDoodle();
    setBusy(generateButton, false, "\u751F\u6210 AI \u5C0F\u7968");
    return;
  }
  const photoDescription = input.value.trim();
  if (!photoDescription) {
    setStatus("\u8BF7\u5148\u8F93\u5165\u7167\u7247\u63CF\u8FF0\u3002", "error");
    return;
  }
  setBusy(generateButton, true, "AI \u6B63\u5728\u5410\u69FD...");
  setStatus("\u6B65\u9AA4 3\uFF1A\u6B63\u5728\u751F\u6210\u8BC4\u4EF7\u5E76\u6392\u7248\u3002", "loading");
  const selectedLayout = classifiedLayoutType ?? await classifyDescription();
  const generationMode = selectedLayout ?? mode.value;
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
    const payload = await response.json();
    if (!response.ok || payload.error) throw new Error(formatApiError(payload, "API request failed."));
    latestAiComment = payload.aiComment?.trim() ?? "";
    latestEnhancedDescription = payload.enhancedDescription?.trim() ?? "";
    aiCommentEl.textContent = latestAiComment || "\u6A21\u578B\u6CA1\u6709\u8FD4\u56DE\u8BC4\u4EF7\uFF0C\u5DF2\u4F7F\u7528\u672C\u5730\u6A21\u677F\u3002";
    setStatus("\u6B65\u9AA4 3 \u5B8C\u6210\uFF1AAI \u8BC4\u4EF7\u5DF2\u751F\u6210\uFF0C\u5E76\u5B8C\u6210\u5C0F\u7968\u6392\u7248\u3002", "ready");
    renderLocal();
  } catch (error) {
    latestAiComment = "";
    latestEnhancedDescription = "";
    aiCommentEl.textContent = error instanceof Error ? error.message : "API \u8C03\u7528\u5931\u8D25\uFF0C\u5DF2\u56DE\u9000\u672C\u5730\u6A21\u677F\u3002";
    setStatus("API \u4E0D\u53EF\u7528\uFF0C\u5F53\u524D\u663E\u793A\u672C\u5730\u6A21\u677F\u7ED3\u679C\u3002", "error");
    renderLocal();
  } finally {
    setBusy(generateButton, false, "\u751F\u6210 AI \u5C0F\u7968");
  }
}
async function generateDoodle() {
  const imagePayload = selectedImageDataUrl || selectedImageUrl;
  if (!imagePayload) {
    const message = "\u50CF\u7D20\u7B80\u7B14\u753B\u9700\u8981\u5148\u4E0A\u4F20\u56FE\u7247\u6216\u9009\u62E9\u793A\u4F8B\u56FE\u7247\u3002";
    setStatus(message, "error");
    doodleStatus.textContent = message;
    return;
  }
  showDoodlePreview(true);
  doodleStatus.textContent = "\u6B63\u5728\u8C03\u7528\u56FE\u50CF\u7F16\u8F91\u6A21\u578B\u751F\u6210\u9ED1\u767D\u4E8C\u503C\u6F2B\u753B\u7EBF\u7A3F...";
  try {
    const response = await fetch("/api/generate-doodle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...selectedImageDataUrl ? { imageDataUrl: selectedImageDataUrl } : { imageUrl: selectedImageUrl }
      })
    });
    const payload = await response.json();
    if (!response.ok || payload.error) throw new Error(formatApiError(payload, "\u50CF\u7D20\u7B80\u7B14\u753B\u751F\u6210\u5931\u8D25\u3002"));
    const imageSrc = payload.imageUrl || (payload.imageBase64 ? `data:image/png;base64,${payload.imageBase64}` : "");
    if (!imageSrc) throw new Error("\u56FE\u50CF\u7F16\u8F91\u6A21\u578B\u6CA1\u6709\u8FD4\u56DE\u56FE\u7247\u3002");
    doodleImage.src = imageSrc;
    doodleStatus.textContent = "\u9ED1\u767D\u4E8C\u503C\u6F2B\u753B\u7EBF\u7A3F\u5DF2\u751F\u6210\u3002";
    latestAiComment = "\u672C\u673A\u5DF2\u628A\u8FD9\u5F20\u7167\u7247\u6539\u9020\u6210\u9002\u5408\u70ED\u654F\u7EB8\u7684\u9ED1\u767D\u6F2B\u753B\u7EBF\u7A3F\u3002";
    aiCommentEl.textContent = latestAiComment;
    setStatus("\u6B65\u9AA4 3 \u5B8C\u6210\uFF1A\u9ED1\u767D\u4E8C\u503C\u6F2B\u753B\u7EBF\u7A3F\u5DF2\u751F\u6210\u3002", "ready");
  } catch (error) {
    const message = error instanceof Error ? error.message : "\u50CF\u7D20\u7B80\u7B14\u753B\u751F\u6210\u5931\u8D25\u3002";
    doodleStatus.textContent = message;
    setStatus(message, "error");
  }
}
function renderLocal() {
  const sourceDescription = latestEnhancedDescription || input.value;
  if (getLayoutMode() === "pixel_doodle") {
    showDoodlePreview(true);
    layoutType.textContent = "pixel_doodle";
    reason.textContent = "\u5F53\u524D\u6A21\u5F0F\u4E3A\u50CF\u7D20\u7B80\u7B14\u753B\uFF0C\u5C06\u76F4\u63A5\u4ECE\u56FE\u7247\u751F\u6210\u767D\u5E95\u9ED1\u7EBF\u7684\u4E8C\u503C\u6F2B\u753B\u7EBF\u7A3F\u3002";
    heightReadout.textContent = "image edit";
    textPreview.textContent = "[ pixel_doodle ]\n\u8C03\u7528\u56FE\u50CF\u7F16\u8F91\u6A21\u578B\u751F\u6210\u767D\u5E95\u9ED1\u7EBF\u7684\u4E8C\u503C\u6F2B\u753B\u7EBF\u7A3F\u3002";
    return;
  }
  showDoodlePreview(false);
  const result = generateRoastLayoutWithSkills(
    {
      photoDescription: sourceDescription,
      generatedComment: latestAiComment,
      mode: getLayoutMode(),
      roastLevel: roastLevel.value,
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
function getLayoutMode() {
  if (mode.value !== "auto") return mode.value;
  return classifiedLayoutType ?? "auto";
}
function resetGeneratedState() {
  latestAiComment = "";
  latestEnhancedDescription = "";
  classifiedLayoutType = void 0;
  aiCommentEl.textContent = "\u5C1A\u672A\u8C03\u7528 API\uFF0C\u5F53\u524D\u4E3A\u672C\u5730\u6A21\u677F\u9884\u89C8\u3002";
  classificationReason.textContent = "\u5C1A\u672A\u5206\u7C7B\u3002";
  classificationConfidence.textContent = "-";
  setStepStatus(classificationStatus, "\u7B49\u5F85\u4E09\u5206\u7C7B\u3002", "ready");
  renderClassification();
}
function renderClassification() {
  classificationType.textContent = classifiedLayoutType ?? (mode.value === "auto" ? "\u7B49\u5F85\u5206\u7C7B" : mode.value);
}
function showDoodlePreview(show) {
  doodleStage.hidden = !show;
  receiptPaper.parentElement?.toggleAttribute("hidden", show);
}
function setStatus(message, state) {
  apiStatus.textContent = message;
  apiStatus.dataset.state = state;
}
function setStepStatus(element, message, state) {
  element.textContent = message;
  element.dataset.state = state;
}
function formatApiError(payload, fallback) {
  const detail = payload.detail || payload.error || fallback;
  if (detail.includes("Model disabled")) {
    return `${fallback} \u5F53\u524D\u89C6\u89C9\u6A21\u578B\u4E0D\u53EF\u7528\uFF1AModel disabled\u3002\u8BF7\u5728 .env \u4E2D\u66F4\u6362 SILICONFLOW_VISION_MODEL\uFF0C\u6216\u786E\u8BA4\u8BE5\u6A21\u578B\u5DF2\u5728 SiliconFlow \u8D26\u53F7\u4E2D\u542F\u7528\u3002`;
  }
  return detail;
}
function setBusy(button, busy, label) {
  button.disabled = busy;
  button.textContent = label;
}
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Failed to read image.")));
    reader.readAsDataURL(file);
  });
}
function mustQuery(selector) {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Missing DOM element: ${selector}`);
  return element;
}
aiCommentEl.textContent = "\u5C1A\u672A\u8C03\u7528 API\uFF0C\u5F53\u524D\u4E3A\u672C\u5730\u6A21\u677F\u9884\u89C8\u3002";
classificationReason.textContent = "\u5C1A\u672A\u5206\u7C7B\u3002";
classificationConfidence.textContent = "-";
setStepStatus(imageStatus, "\u8BF7\u9009\u62E9\u793A\u4F8B\u56FE\u6216\u4E0A\u4F20\u56FE\u7247\u3002", "ready");
setStepStatus(classificationStatus, "\u7B49\u5F85\u4E09\u5206\u7C7B\u3002", "ready");
setStatus("API \u5C31\u7EEA\u3002\u53EF\u4EE5\u4ECE\u56FE\u7247\u5206\u6790\u5F00\u59CB\uFF0C\u4E5F\u53EF\u4EE5\u76F4\u63A5\u7F16\u8F91\u6587\u5B57\u751F\u6210\u3002", "ready");
renderClassification();
renderLocal();
