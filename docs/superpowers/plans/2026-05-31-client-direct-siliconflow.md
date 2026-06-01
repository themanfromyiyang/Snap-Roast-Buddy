# 客户端直连 SiliconFlow 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把最慢的两个上游调用（`/api/roast`、`/api/generate-doodle`）从 Vercel Serverless 函数链路里搬到浏览器直连 SiliconFlow，彻底绕开 Vercel 60s 函数硬上限导致的 504 卡 2/3 问题。

**Architecture:** 新增 `api/sf-token.mjs` 下发 SiliconFlow key + 配置；新增 `frontend/src/lib/siliconflow.ts` 客户端封装；把 prompt 与解析逻辑从 `api/_shared.mjs` 复制到 `frontend/src/lib/snapRoastPrompts.ts`；改 `frontend/src/product.ts` 的 `generateRoast` 和 `generateSketch` 走直连。`analyze-image` 和 `classify-layout` 不动。第一次部署不带 sf-proxy fallback；CORS 验证不通过时再追加 `api/sf-proxy.mjs`（Edge runtime）。

**Tech Stack:** ESM, esbuild, Vercel Node Serverless（保留）+ Vercel Edge Function（条件追加）, SiliconFlow OpenAI-compatible API。

参考设计稿：[docs/superpowers/specs/2026-05-31-client-direct-siliconflow-design.md](../specs/2026-05-31-client-direct-siliconflow-design.md)

---

## 文件结构

新增：
- `api/sf-token.mjs` — GET endpoint，下发 `{ key, baseUrl, models }`
- `frontend/src/lib/snapRoastPrompts.ts` — 从 `api/_shared.mjs` 复制 prompt + parser
- `frontend/src/lib/siliconflow.ts` — 客户端 SiliconFlow 封装
- `api/sf-proxy.mjs` — Edge runtime fallback，仅 Task 6 条件触发

修改：
- `frontend/src/product.ts` — `generateRoast`、`generateSketch`、`postJson`

不动：
- `api/_shared.mjs`（`handleAnalyzeImage`、`handleClassifyLayout` 仍依赖里面的 prompt builder）
- `api/analyze-image.mjs`、`api/classify-layout.mjs`、`api/roast.mjs`、`api/generate-doodle.mjs`（roast / doodle 后端函数虽然客户端不再调用，但留着无害且方便回滚）

---

## Task 1: 新增 `api/sf-token.mjs` —— 下发客户端直连所需的 key 和配置

**Files:**
- Create: `api/sf-token.mjs`

- [ ] **Step 1: 创建文件**

写入：

```js
const siliconFlowApiKey = process.env.SILICONFLOW_API_KEY ?? process.env.OPENAI_API_KEY;
const siliconFlowBaseUrl = process.env.SILICONFLOW_BASE_URL ?? "https://api.siliconflow.cn/v1";
const siliconFlowModel = process.env.SILICONFLOW_MODEL ?? "Pro/zai-org/GLM-4.7";
const siliconFlowImageEditModel = process.env.SILICONFLOW_IMAGE_EDIT_MODEL ?? "Qwen/Qwen-Image-Edit-2509";

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("content-type", "application/json; charset=utf-8");
  if (!siliconFlowApiKey) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "Missing SILICONFLOW_API_KEY in environment." }));
    return;
  }
  res.statusCode = 200;
  res.end(JSON.stringify({
    key: siliconFlowApiKey,
    baseUrl: siliconFlowBaseUrl,
    models: {
      chat: siliconFlowModel,
      imageEdit: siliconFlowImageEditModel
    }
  }));
}
```

- [ ] **Step 2: 本地启动后端 + curl 自检**

```powershell
$env:SILICONFLOW_API_KEY = "sk-fake-for-local"; node backend/server.mjs
```

新开 PowerShell：

```powershell
curl http://localhost:5173/api/sf-token
```

预期：返回 `{"key":"sk-fake-for-local","baseUrl":"https://api.siliconflow.cn/v1","models":{...}}`。

> 注意：[backend/server.mjs](../../../backend/server.mjs) 是本地 dev 路由表，目前没注册 `/api/sf-token`。若 curl 404，需要先在 server.mjs 里加路由（详见 Step 3）。

- [ ] **Step 3: 把 `/api/sf-token` 加到本地 dev server 路由**

编辑 [backend/server.mjs](../../../backend/server.mjs)。当前 server.mjs 用 `await import(...)` 动态导入 `_shared.mjs` 并 destructure，保持一致：

a. 在第 18 行 `} = await import("../api/_shared.mjs");` 之后**新起一行**加：

```js
const { default: handleSfToken } = await import("../api/sf-token.mjs");
```

b. 路由分发处（与其它 `if (request.method === "POST" && url.pathname === "/api/roast") ...` 同段落，约第 37-48 行附近）加：

```js
if (request.method === "GET" && url.pathname === "/api/sf-token") return handleSfToken(request, response);
```

- [ ] **Step 4: 重启本地 server 并再次 curl 验证**

```powershell
curl http://localhost:5173/api/sf-token
```

预期：200 + JSON。

- [ ] **Step 5: Commit**

```powershell
git add api/sf-token.mjs backend/server.mjs
git commit -m "feat(api): add /api/sf-token endpoint for browser-direct SiliconFlow calls"
```

---

## Task 2: 新增 `frontend/src/lib/snapRoastPrompts.ts` —— 把 prompt + parser 搬到前端

**Files:**
- Create: `frontend/src/lib/snapRoastPrompts.ts`

> 这些函数原本在 [api/_shared.mjs](../../../api/_shared.mjs) 里，是 Node 端的。直接复制为 TypeScript 等价物，浏览器和 Node 都能跑。**不要**改后端原文件，`/api/analyze-image` 和 `/api/classify-layout` 仍依赖它们。

- [ ] **Step 1: 创建文件**

写入：

```ts
export type RoastMode = "auto" | "receipt" | "big_text" | "pixel_expression";
export type RoastLevel = "gentle" | "normal" | "spicy";

export function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

export function buildCurrentRoastPrompt(mode: string, roastLevel: string): string {
  const tone =
    roastLevel === "spicy"
      ? "吐槽可以更有节目效果、更锋利，但不要恶意攻击人。"
      : roastLevel === "gentle"
        ? "语气温柔、可爱，像朋友轻轻调侃。"
        : "语气轻松、有综艺感，像一个嘴很碎但不坏的拍照搭子。";

  const modeGuides: Record<string, string> = {
    receipt:
      "当前生成 receipt 小票式内容：不要只写摄影建议。要像照片事件报告，可以包含画面剧情、人物状态、氛围判断、梗点、轻建议。2 到 4 句，短句优先。",
    big_text:
      "当前生成 big_text 爆字内容：像综艺字幕、紧急播报或现场通告。必须短、狠、可一眼记住。最多 2 句，优先形成一个梗。",
    pixel_expression:
      "当前生成 pixel_expression 表情内容：像设备被照片刺激后的反应。文案要短，偏情绪、拟人化、表情包语气，最多 2 句。",
    auto:
      "当前是 auto：根据照片描述写一段适合热敏纸的短评价，重点是让纸条有性格，而不是普通摄影点评。"
  };

  return [
    "你是“拍立怼 Snap Roast Buddy”，一个有性格但不恶意的 AI 拍照搭子。",
    "用户会给你一段照片描述，你要输出有趣评价，用于 58mm 热敏纸小票排版。",
    tone,
    modeGuides[mode] ?? modeGuides.auto,
    "评价角度要多样：可以写画面剧情、现场氛围、人物/宠物状态、背景抢戏、表情管理、拍摄时机、社交场面、照片命运，也可以给一点拍摄建议。",
    "不要每次都写“修改后可发”或只评价构图、光线、角度。结论可以是：建议收藏、适合当表情包、适合发群里、需要配文狡辩、建议补拍一张、适合做证据、适合留作黑历史等。",
    "吐槽重点只能放在构图、光线、背景、角度、表情状态、画面戏剧性、拍摄时机、照片氛围，禁止攻击真实长相、身材、种族、性别、年龄、残障等敏感属性。",
    "输出必须是严格 JSON 对象，不要 Markdown，不要代码块，不要在 JSON 前后加解释文字。",
    "JSON 格式：{\"aiComment\":\"用于小票正文的有趣评价，中文，短句，可包含换行\",\"enhancedDescription\":\"保留原始照片事实，并补充你识别出的槽点关键词\"}",
    "aiComment 中不要出现 JSON 花括号、字段名、括号残留或引号残留。"
  ].join("\n");
}

export function buildCurrentDoodlePrompt(): string {
  return [
    "把输入图片重新创作成一张适合 58mm 热敏纸小票内嵌展示的黑白漫画贴纸。",
    "重要：不要只是提取原图线稿。请先理解图片主体、动作、情绪和笑点，再重新画成更有趣、更夸张、更可爱的抽象漫画。",
    "画面比例要求：输出构图适合横向小票插画区，接近 3:2 或 4:3，不要沿用原图比例；主体居中，占画面 65% 到 85%。",
    "硬性要求：纯白背景，纯黑线条和纯黑块面，黑白二值；不要灰度、彩色、阴影、渐变、纸张纹理、摄影质感。",
    "风格：简洁漫画、可爱、线条清楚、略带表情包感；可以夸张表情、姿势或小道具，但不要恐怖或攻击性。",
    "背景需要大幅简化，只保留能帮助理解笑点的元素。最终应像可以直接热敏打印的黑白贴纸。"
  ].join("\n");
}

function sanitizeModelText(value: unknown): string {
  let text = cleanText(value);
  text = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const jsonText = text.match(/\{[\s\S]*\}/)?.[0];
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText);
      text = cleanText(parsed.aiComment || parsed.comment || parsed.text || text);
    } catch {
      text = text.replace(/[{}]/g, "");
    }
  }
  return text
    .replace(/^\s*["']?(aiComment|comment|text|评价|短评)["']?\s*[:：]\s*/i, "")
    .replace(/["'{}]+$/g, "")
    .trim();
}

export interface ParsedRoastPayload {
  aiComment: string;
  enhancedDescription: string;
}

export function parseModelPayload(rawContent: string): ParsedRoastPayload {
  const jsonText = rawContent.match(/\{[\s\S]*\}/)?.[0] ?? "";
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText);
      return {
        aiComment: sanitizeModelText(parsed.aiComment || rawContent),
        enhancedDescription: sanitizeModelText(parsed.enhancedDescription || "")
      };
    } catch {
      // Fall through to plain-text handling.
    }
  }
  return {
    aiComment: sanitizeModelText(rawContent),
    enhancedDescription: ""
  };
}

export interface ExtractedImage {
  url?: string;
  base64?: string;
}

export function extractGeneratedImage(data: any): ExtractedImage {
  const first = data?.data?.[0] ?? data?.images?.[0] ?? data?.image;
  if (typeof first === "string") return first.startsWith("http") ? { url: first } : { base64: first };
  if (first?.url) return { url: first.url };
  if (first?.b64_json) return { base64: first.b64_json };
  if (first?.base64) return { base64: first.base64 };
  return {};
}

export async function downloadImageAsDataUrl(url: string): Promise<string> {
  if (!url || !url.startsWith("http")) return "";
  try {
    const res = await fetch(url);
    if (!res.ok) return "";
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) return "";
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
      reader.readAsDataURL(blob);
    });
  } catch {
    return "";
  }
}
```

- [ ] **Step 2: TypeScript 自检**

```powershell
npm run check
```

预期：无新增错误。如果旧代码本来就有 error，确认错误位置不在 `snapRoastPrompts.ts`。

- [ ] **Step 3: Commit**

```powershell
git add frontend/src/lib/snapRoastPrompts.ts
git commit -m "feat(frontend): port SiliconFlow prompts and payload parsers from api/_shared.mjs"
```

---

## Task 3: 新增 `frontend/src/lib/siliconflow.ts` —— 客户端 SiliconFlow 封装

**Files:**
- Create: `frontend/src/lib/siliconflow.ts`

> 提供 `chatCompletion` 和 `imageEdit` 两个调用。CORS 失败时自动降级到 `/api/sf-proxy?endpoint=...`（同源），降级路径在本任务先**预留**——`sf-proxy` 端点本身在 Task 6 才创建。模块级缓存配置和"是否需要走 fallback"标记。

- [ ] **Step 1: 创建文件**

写入：

```ts
export interface SiliconFlowConfig {
  key: string;
  baseUrl: string;
  models: { chat: string; imageEdit: string };
}

let configPromise: Promise<SiliconFlowConfig> | undefined;
let useProxyFallback = false;

export function fetchSiliconFlowConfig(): Promise<SiliconFlowConfig> {
  if (!configPromise) {
    configPromise = (async () => {
      const res = await fetch("/api/sf-token");
      if (!res.ok) {
        configPromise = undefined;
        throw new Error(`无法获取 SiliconFlow 配置：HTTP ${res.status}`);
      }
      const payload = (await res.json()) as SiliconFlowConfig & { error?: string };
      if (payload.error) {
        configPromise = undefined;
        throw new Error(payload.error);
      }
      return payload;
    })();
  }
  return configPromise;
}

async function postSiliconFlow(endpoint: "chat/completions" | "images/generations", body: unknown): Promise<any> {
  const config = await fetchSiliconFlowConfig();

  const directUrl = `${config.baseUrl.replace(/\/+$/, "")}/${endpoint}`;
  const proxyUrl = `/api/sf-proxy?endpoint=${encodeURIComponent(endpoint)}`;

  const send = async (url: string, withAuth: boolean): Promise<Response> => {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (withAuth) headers.authorization = `Bearer ${config.key}`;
    return fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  };

  let response: Response;
  if (useProxyFallback) {
    response = await send(proxyUrl, false);
  } else {
    try {
      response = await send(directUrl, true);
    } catch (err) {
      // TypeError 通常意味着 CORS preflight 失败或网络错误，降级到同源 proxy。
      if (err instanceof TypeError) {
        useProxyFallback = true;
        console.warn("[siliconflow] direct call blocked, falling back to /api/sf-proxy:", err.message);
        response = await send(proxyUrl, false);
      } else {
        throw err;
      }
    }
  }

  const text = await response.text();
  if (!response.ok) {
    const snippet = text.trim().slice(0, 240) || `HTTP ${response.status}`;
    throw new Error(`SiliconFlow ${endpoint} 失败：${snippet}`);
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`SiliconFlow ${endpoint} 返回非 JSON：${text.trim().slice(0, 240)}`);
  }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionOptions {
  messages: ChatMessage[];
  temperature?: number;
}

export async function chatCompletion(options: ChatCompletionOptions): Promise<any> {
  const config = await fetchSiliconFlowConfig();
  return postSiliconFlow("chat/completions", {
    model: config.models.chat,
    messages: options.messages,
    temperature: options.temperature ?? 0.78
  });
}

export interface ImageEditOptions {
  prompt: string;
  imageDataUrl: string;
}

export async function imageEdit(options: ImageEditOptions): Promise<any> {
  const config = await fetchSiliconFlowConfig();
  return postSiliconFlow("images/generations", {
    model: config.models.imageEdit,
    prompt: options.prompt,
    num_inference_steps: 20,
    guidance_scale: 4,
    image: options.imageDataUrl,
    image2: options.imageDataUrl,
    image3: options.imageDataUrl
  });
}
```

- [ ] **Step 2: TypeScript 自检**

```powershell
npm run check
```

预期：无新增错误。

- [ ] **Step 3: Commit**

```powershell
git add frontend/src/lib/siliconflow.ts
git commit -m "feat(frontend): add browser-direct SiliconFlow client with proxy fallback hook"
```

---

## Task 4: 改 `frontend/src/product.ts` —— 切换 generateRoast / generateSketch 到直连 + 防御性 postJson

**Files:**
- Modify: `frontend/src/product.ts`

- [ ] **Step 1: 顶部 import 区加新模块**

找到 import 区（文件开头 import 那一段，应该都在前 80 行内），加入：

```ts
import {
  buildCurrentRoastPrompt,
  buildCurrentDoodlePrompt,
  parseModelPayload,
  extractGeneratedImage,
  downloadImageAsDataUrl
} from "./lib/snapRoastPrompts";
import { chatCompletion, imageEdit, fetchSiliconFlowConfig } from "./lib/siliconflow";
```

- [ ] **Step 2: 替换 `generateRoast`**

找到 [product.ts:809-815](../../../frontend/src/product.ts#L809-L815)：

```ts
async function generateRoast(description: string, layoutType: RoastMode, roastLevel: ProductRoastLevel) {
  return postJson<RoastApiResponse>("/api/roast", {
    photoDescription: description,
    mode: layoutType,
    roastLevel: mapRoastLevel(roastLevel)
  });
}
```

替换为：

```ts
async function generateRoast(description: string, layoutType: RoastMode, roastLevel: ProductRoastLevel): Promise<RoastApiResponse> {
  const mappedLevel = mapRoastLevel(roastLevel);
  const data = await chatCompletion({
    messages: [
      { role: "system", content: buildCurrentRoastPrompt(layoutType, mappedLevel) },
      { role: "user", content: `照片描述：${description}` }
    ],
    temperature: mappedLevel === "spicy" ? 0.92 : mappedLevel === "gentle" ? 0.58 : 0.78
  });
  const rawContent = String(data?.choices?.[0]?.message?.content ?? "");
  const parsed = parseModelPayload(rawContent);
  return {
    aiComment: parsed.aiComment,
    enhancedDescription: parsed.enhancedDescription || description,
    rawContent
  };
}
```

> 类型 `RoastApiResponse` 已经在 product.ts 顶部定义；如果其字段是 optional 而当前实现填了全部三个，无需改。如发现字段名不匹配，直接对齐到已有定义。

- [ ] **Step 3: 替换 `generateSketch`**

找到 [product.ts:817-822](../../../frontend/src/product.ts#L817-L822)：

```ts
async function generateSketch(imageUrl: string): Promise<string> {
  const payload = await postJson<DoodleResponse>("/api/generate-doodle", { imageDataUrl: imageUrl });
  const result = payload.imageDataUrl || payload.imageUrl || (payload.imageBase64 ? `data:image/png;base64,${payload.imageBase64}` : "");
  if (!result) throw new Error("漫画模型没有返回图片。");
  return result;
}
```

替换为：

```ts
async function generateSketch(imageUrl: string): Promise<string> {
  const data = await imageEdit({
    prompt: buildCurrentDoodlePrompt(),
    imageDataUrl: imageUrl
  });
  const extracted = extractGeneratedImage(data);
  if (extracted.base64) return `data:image/png;base64,${extracted.base64}`;
  if (extracted.url) {
    const dataUrl = await downloadImageAsDataUrl(extracted.url);
    if (dataUrl) return dataUrl;
    return extracted.url; // CORS 拿不下来 dataURL 时退化到 URL（ticket DOM 用 <img src> 仍能渲染）
  }
  throw new Error("漫画模型没有返回图片。");
}
```

- [ ] **Step 4: 加固 `postJson` 的非 JSON 容错**

找到 [product.ts:1681-1690](../../../frontend/src/product.ts#L1681-L1690)：

```ts
async function postJson<T extends { error?: string; detail?: string }>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = (await response.json()) as T;
  if (!response.ok || payload.error) throw new Error(formatApiError(payload, "生成失败。"));
  return payload;
}
```

替换为：

```ts
async function postJson<T extends { error?: string; detail?: string }>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const rawText = await response.text();
  let payload: T;
  try {
    payload = (rawText ? JSON.parse(rawText) : {}) as T;
  } catch {
    const snippet = rawText.trim().slice(0, 240) || `HTTP ${response.status}`;
    throw new Error(response.ok ? `响应不是有效 JSON：${snippet}` : `服务器错误（HTTP ${response.status}）：${snippet}`);
  }
  if (!response.ok || payload.error) throw new Error(formatApiError(payload, "生成失败。"));
  return payload;
}
```

- [ ] **Step 5: 启动时预热 SiliconFlow 配置**

product.ts 的启动逻辑在文件底部（约 [product.ts:1760-1766](../../../frontend/src/product.ts#L1760-L1766)），最后一行是 `productRecordsLoadPromise = loadProductRecords();`。在它**下一行**加：

```ts
void fetchSiliconFlowConfig().catch((err) => {
  console.warn("[siliconflow] 配置预拉取失败，首次生成时会重试:", err);
});
```

> 预热失败不能阻塞页面，所以用 `.catch` 兜住。`fetchSiliconFlowConfig` 内部已有 promise 缓存，首次生成调用时如果预热已完成就直接复用。

- [ ] **Step 6: TypeScript 自检**

```powershell
npm run check
```

预期：无新增错误。如果有，按错误信息修字段名/类型。

- [ ] **Step 7: 构建并扫一眼产物**

```powershell
npm run build:frontend
```

预期：构建成功，`frontend/dist/product.js` 被刷新。打开 `frontend/dist/product.js` 用 Grep 验证：

```
Grep "api/sf-token" frontend/dist/product.js   # 应该有
Grep "api/roast"    frontend/dist/product.js   # 应该没有了（路径已替换为直连）
Grep "api/generate-doodle" frontend/dist/product.js  # 应该没有了
```

- [ ] **Step 8: Commit**

```powershell
git status frontend/dist
git add frontend/src/product.ts frontend/dist/product.js
git commit -m "feat(product): switch roast and sketch calls to browser-direct SiliconFlow"
```

> `git status frontend/dist` 用来确认本次构建只刷新了 `dist/product.js`（snapRoastPrompts / siliconflow 只被 product.ts 引用，不会牵动 app.js / debug.js）。如果 `dist/app.js` 或 `dist/debug.js` 也被改了说明意外牵入了共享模块，先排查再 commit。
> Vercel 的 `vercel-build` 会重新构建一次，但保持 dist 入库可以让线上不依赖构建机环境。

---

## Task 5: 本地手动验证 + 部署到 Vercel + CORS 探测

**Files:** 无代码改动

- [ ] **Step 1: 本地运行验证基础链路**

```powershell
$env:SILICONFLOW_API_KEY = "<真实 key>"; node backend/server.mjs
```

浏览器打开 `http://localhost:5173/`（首页 index.html 即 product 入口），DevTools 打开 Network + Console。生成一张照片：

- 看到 GET `/api/sf-token` 200，响应里有 key 和 baseUrl。
- 看到 POST `https://api.siliconflow.cn/v1/chat/completions` 和 `/images/generations` 直发到 SiliconFlow，200。
- 不再看到 POST `/api/roast` 或 `/api/generate-doodle`。
- 小票生成成功，没卡 2/3。

> 本地直连一般不会触发 CORS（浏览器 → `api.siliconflow.cn` 是跨域调用，但本地 origin 是 `http://localhost:5173`，CORS 行为与线上一致）。如果本地就 CORS 失败，可以直接跳到 Task 6，不用先部署。

- [ ] **Step 2: 提交并推送，触发 Vercel 部署**

```powershell
git push origin 57600
```

等 Vercel 部署完成（看 dashboard 或邮件）。

- [ ] **Step 3: 线上验证直连**

打开线上 URL，DevTools 打开 Network + Console。生成一张照片。**关注**：

| 现象 | 含义 | 下一步 |
|---|---|---|
| `chat/completions` 200，`images/generations` 200 | 直连可用，CORS 通过 | Task 6 跳过，宣告完工 |
| Console 报 `Access-Control-Allow-Origin` / `CORS preflight` 错误 | SiliconFlow 不开 CORS | 继续 Task 6 |
| Console 看到 `[siliconflow] direct call blocked, falling back to /api/sf-proxy` | 代码已自动降级，但 sf-proxy 还没创建 → 404 | 继续 Task 6 |
| 仍然 504 卡 2/3 | 直连路径没生效（dist 没更新或浏览器缓存） | hard refresh，再不行检查 dist/product.js 是否包含新代码 |

记录观察结果，决定是否进入 Task 6。

---

## Task 6（条件触发）: 加 `api/sf-proxy.mjs` Edge runtime fallback

> **只有 Task 5 验证 CORS 不通过时才执行本任务。** 如果直连已经能跑，本任务跳过。

**Files:**
- Create: `api/sf-proxy.mjs`
- Modify: `backend/server.mjs`（本地 dev 也注册一个 fallback）

- [ ] **Step 1: 创建 `api/sf-proxy.mjs`**

写入：

```js
export const config = { runtime: "edge" };

const SF_BASE = process.env.SILICONFLOW_BASE_URL ?? "https://api.siliconflow.cn/v1";
const SF_KEY = process.env.SILICONFLOW_API_KEY ?? process.env.OPENAI_API_KEY ?? "";

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  if (!SF_KEY) {
    return new Response(JSON.stringify({ error: "Missing SILICONFLOW_API_KEY in environment." }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }
  const url = new URL(req.url);
  const endpoint = url.searchParams.get("endpoint") ?? "";
  if (endpoint !== "chat/completions" && endpoint !== "images/generations") {
    return new Response(JSON.stringify({ error: "Invalid endpoint." }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }
  const upstreamUrl = `${SF_BASE.replace(/\/+$/, "")}/${endpoint}`;
  const upstream = await fetch(upstreamUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${SF_KEY}`,
      "content-type": req.headers.get("content-type") ?? "application/json"
    },
    body: req.body,
    duplex: "half"
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json"
    }
  });
}
```

> 这是 Edge runtime（V8 isolate），写法和 Node runtime 不同：导出 default `(req) => Response`，没有 res 对象。`duplex: "half"` 是 fetch 流式 body 必需。Vercel Edge runtime 同样支持 `process.env`。

- [ ] **Step 2: 本地 dev 加同名路由（用 Node runtime 兜底，本地没有 Edge runtime）**

编辑 [backend/server.mjs](../../../backend/server.mjs)，加一个简易实现，让本地也能 fallback 起测：

```js
async function handleSfProxyLocal(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const endpoint = url.searchParams.get("endpoint") ?? "";
  if (endpoint !== "chat/completions" && endpoint !== "images/generations") {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "Invalid endpoint." }));
    return;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const body = Buffer.concat(chunks);
  const upstream = await fetch(`${process.env.SILICONFLOW_BASE_URL ?? "https://api.siliconflow.cn/v1"}/${endpoint}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.SILICONFLOW_API_KEY ?? process.env.OPENAI_API_KEY ?? ""}`,
      "content-type": "application/json"
    },
    body
  });
  res.statusCode = upstream.status;
  res.setHeader("content-type", upstream.headers.get("content-type") ?? "application/json");
  res.end(Buffer.from(await upstream.arrayBuffer()));
}
```

路由分发处加：

```js
if (request.method === "POST" && url.pathname === "/api/sf-proxy") return handleSfProxyLocal(request, response);
```

- [ ] **Step 3: 本地验证 fallback**

人为触发降级（最简单：在 DevTools 里用 Network 阻断 `api.siliconflow.cn` 域名，或临时把 `frontend/src/lib/siliconflow.ts` 里 `useProxyFallback` 初始值改为 `true` 临测后改回）。重新构建并刷新：

```powershell
npm run build:frontend
```

刷新页面，生成小票。Network 应看到 POST `/api/sf-proxy?endpoint=chat/completions` 200。

> 测完务必把 `useProxyFallback = true` 改回 `false`。

- [ ] **Step 4: 部署并线上验证**

```powershell
git add api/sf-proxy.mjs backend/server.mjs
git commit -m "feat(api): add Edge-runtime /api/sf-proxy fallback when browser CORS blocks SiliconFlow"
git push origin 57600
```

线上重新生成小票，Console 应看到 `[siliconflow] direct call blocked, falling back to /api/sf-proxy`，然后 `/api/sf-proxy?endpoint=chat/completions` 200，小票生成成功。

- [ ] **Step 5: 跑 3-5 次连续生成压一下**

确认不再出现 504 卡 2/3。

---

## 完工检查

- [ ] 线上连续生成 5 次小票，全部成功
- [ ] 没有 504
- [ ] 没有 `Uncaught SyntaxError: Unexpected token 'A'`
- [ ] DevTools Network 里 roast / generate-doodle 路径要么直发到 `api.siliconflow.cn`、要么走 `/api/sf-proxy`
- [ ] analyze-image / classify-layout 仍走原路径
- [ ] 打印链路（生成的 sketch 渲染进 ticket DOM）没坏
