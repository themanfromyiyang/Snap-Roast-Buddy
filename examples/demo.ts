import { generateRoastLayout } from "../packages/layout/src/index.js";

const examples = [
  "一张朋友聚会自拍，四个人挤在画面里，右边的人被裁掉半张脸，中间的人表情很夸张，背景有很多杂物，光线偏暗。",
  "一个人站在景点前拍照，但是人物非常小，背景建筑很大，人物几乎看不清。",
  "一张小狗趴在地上的照片，它看着镜头，表情很委屈，画面很可爱。"
];

for (const photoDescription of examples) {
  const result = generateRoastLayout({
    photoDescription,
    mode: "auto",
    roastLevel: "normal",
    returnLayoutJson: true
  });

  console.log("\n\n");
  console.log(`layoutType: ${result.layoutType}`);
  console.log(`reason: ${result.reason}`);
  console.log(result.textPreview);
}
