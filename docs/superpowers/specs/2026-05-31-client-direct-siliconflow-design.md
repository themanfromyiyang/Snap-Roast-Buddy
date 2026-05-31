# 客户端直连 SiliconFlow（绕开 Vercel 60s 函数超时）

日期：2026-05-31
状态：设计稿（待实现）

## 背景

线上 Vercel 部署下，「生成小票」流程经常在第 2/3 步卡住后退回拍照界面。DevTools 显示：

- `POST /api/generate-doodle` → 504 Gateway Timeout
- `POST /api/classify-layout` → 504 Gateway Timeout
- 前端控制台：`Uncaught (in promise) SyntaxError: Unexpected token 'A', "An error o"... is not valid JSON`

根因不在前端逻辑，而是：

1. [vercel.json](../../../vercel.json) 设了 `maxDuration: 60`，是 Vercel Hobby plan 的硬上限。
2. 上游 SiliconFlow 推理模型（`Pro/zai-org/GLM-4.7`、`Pro/moonshotai/Kimi-K2.6`、`Qwen/Qwen-Image-Edit-2509`）在繁忙时段经常 > 60s。
3. 函数被 Vercel kill 后返回 HTML 错误页，前端 [product.ts:1687](../../../frontend/src/product.ts#L1687) `postJson` 直接 `await response.json()`，解析 HTML 抛 SyntaxError，被外层 catch 接住 → `showCamera()`。

## 目标

把最慢的两个上游调用从 Vercel 函数链路里搬出来，让它们不再受 60s 限制：

- `/api/generate-doodle` → 浏览器直连 SiliconFlow `/images/generations`
- `/api/roast` → 浏览器直连 SiliconFlow `/chat/completions`

`/api/analyze-image` 和 `/api/classify-layout` 输入小、输出短，60s 通常足够，保留不动。

## 非目标

- 不做用户自带 API key 的输入 UI（key 由服务器下发）。
- 不做 prompt 工程的共享 ESM 抽象（前后端 runtime 不同，复制一份避免 build 改造）。
- 不做 retry / 指数退避。失败回退到拍照界面已经是足够的失败语义。
- 不做 analyze / classify 的客户端化。

## 架构

```
┌───────────── 浏览器 ─────────────┐                ┌─────── Vercel ───────┐
│                                  │                │                      │
│  product.ts                      │                │  /api/sf-token       │← 新增
│   ├ analyzeImage  ───────────────┼──── POST ─────►│  /api/analyze-image  │  保留
│   ├ classifyLayout ──────────────┼──── POST ─────►│  /api/classify-layout│  保留
│   ├ generateRoast  ──────────────┼──┐             │  /api/sf-proxy       │← 新增（CORS fallback）
│   └ generateSketch ──────────────┼──┤             │                      │
│                                  │  │             │                      │
│         siliconflow.ts ──────────┼──┴──直连──────►  api.siliconflow.cn   │
└──────────────────────────────────┘     fallback   └──────────────────────┘
                                            │
                                            └──► /api/sf-proxy (Edge runtime)
```

## 组件

### 1. `api/sf-token.mjs`（新增）

GET 端点，返回客户端直连所需配置：

```json
{
  "key": "sk-...",
  "baseUrl": "https://api.siliconflow.cn/v1",
  "models": {
    "chat": "Pro/zai-org/GLM-4.7",
    "imageEdit": "Qwen/Qwen-Image-Edit-2509"
  }
}
```

实现细节：
- 读取 `process.env.SILICONFLOW_API_KEY` / `OPENAI_API_KEY`、`SILICONFLOW_BASE_URL`、`SILICONFLOW_MODEL`、`SILICONFLOW_IMAGE_EDIT_MODEL`。
- 缺 key 返回 500 `{ error: "missing key" }`。
- 响应头 `Cache-Control: no-store`。
- 极快返回，不可能触发 504。
- 接受 key 公开的风险（用户已确认）。

### 2. `frontend/src/lib/siliconflow.ts`（新增）

客户端封装：

```ts
export async function fetchSiliconFlowConfig(): Promise<SiliconFlowConfig>;
export async function chatCompletion(body: object): Promise<any>;
export async function imageEdit(body: object): Promise<any>;
```

- `fetchSiliconFlowConfig` 模块级 promise 缓存：第一次调用拉 `/api/sf-token`，之后所有调用复用。
- `chatCompletion` / `imageEdit` 先尝试直连 `${baseUrl}/chat/completions` 或 `/images/generations`，带 `Authorization: Bearer <key>`。
- **CORS / 网络错误自动降级到 `/api/sf-proxy?endpoint=chat/completions`**（见组件 4）。降级判断：fetch 抛 TypeError（CORS preflight 失败浏览器报 TypeError）即降级。
- 降级路径在模块级缓存一个 boolean，避免每次请求都重复探测。

### 3. Prompt / 解析逻辑搬迁

从 [api/_shared.mjs](../../../api/_shared.mjs) 复制以下函数到 `frontend/src/lib/snapRoastPrompts.ts`：

- `buildCurrentRoastPrompt(mode, roastLevel)`
- `buildSystemPrompt(mode, roastLevel)`（被上面调用）
- `buildCurrentDoodlePrompt()`
- `parseModelPayload(rawContent)`
- `extractGeneratedImage(data)`
- `downloadImageAsDataUrl(url)`（如果 SiliconFlow 只返回 URL，需要在浏览器里抓回来转 dataURL；浏览器抓 SiliconFlow 返回的 CDN URL 也可能受 CORS 限制，先用 base64 直返，URL 兜底）

后端 `_shared.mjs` 里保留这些函数不删，`/api/analyze-image` 和 `/api/classify-layout` 仍依赖它们。前后端各持一份，接受短期重复。

### 4. `api/sf-proxy.mjs`（CORS fallback，新增）

Edge runtime 流式透传：

```js
export const config = { runtime: 'edge' };

export default async function handler(req) {
  const url = new URL(req.url);
  const endpoint = url.searchParams.get('endpoint'); // chat/completions | images/generations
  const upstream = await fetch(`${SF_BASE}/${endpoint}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${SF_KEY}`, 'content-type': 'application/json' },
    body: req.body,
    duplex: 'half'
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' }
  });
}
```

- Edge runtime 在 Vercel 上响应可以流式持续，不受 Node serverless function 60s 限制。
- 仅在客户端 (2) 直连失败时启用。
- 不读 body 不做超时处理，纯透传。

### 5. `frontend/src/product.ts` 改动

| 位置 | 改动 |
|---|---|
| [product.ts:809-815](../../../frontend/src/product.ts#L809-L815) `generateRoast` | 用 `siliconflow.chatCompletion` + 本地 `buildCurrentRoastPrompt` + `parseModelPayload` 取代 `postJson('/api/roast', ...)` |
| [product.ts:817-822](../../../frontend/src/product.ts#L817-L822) `generateSketch` | 用 `siliconflow.imageEdit` + 本地 `buildCurrentDoodlePrompt` + `extractGeneratedImage` 取代 `postJson('/api/generate-doodle', ...)` |
| [product.ts:789-793](../../../frontend/src/product.ts#L789-L793) `analyzeImage` | 不动 |
| [product.ts:795-807](../../../frontend/src/product.ts#L795-L807) `resolveLayoutType` | 不动 |
| [product.ts:1681-1690](../../../frontend/src/product.ts#L1681-L1690) `postJson` | 在 `await response.json()` 外加 try/catch，非 JSON 响应改抛 `服务器响应非 JSON：HTTP <status>`，让以后任何 504 报错友好（防御性） |

应用启动时（首张照片生成前）触发一次 `fetchSiliconFlowConfig`，让 key 提前到位，避免第一次生成时多一次往返。

## 数据流（generateSketch 为例）

```
浏览器                           SiliconFlow (or sf-proxy)
   │
   │ fetchSiliconFlowConfig()          一次性，启动时
   ├─────► /api/sf-token ──────► { key, baseUrl, models }
   │
   │ generateSketch(imageDataUrl)
   ├─────► POST baseUrl + /images/generations
   │       Authorization: Bearer <key>
   │       body: { model: imageEdit, prompt, image: dataUrl, ... }
   │
   │       (60s 不再是上限)
   │ ◄──── { data: [{ b64_json | url }] }
   │
   │ extractGeneratedImage(data) → imageDataUrl
```

CORS 失败降级：

```
   │ chatCompletion(body)
   ├─► fetch(api.siliconflow.cn) → TypeError (CORS)
   │   useFallback = true
   ├─► fetch(/api/sf-proxy?endpoint=chat/completions) → 200 流式响应
   │ ◄────
```

## 风险

| 风险 | 概率 | 应对 |
|---|---|---|
| SiliconFlow 不开 CORS（preflight 失败） | 中 | 自动降级到 `/api/sf-proxy`（Edge runtime） |
| Edge runtime body 上限 4.5MB | 低 | 单张照片 dataURL 一般 1-2MB；超出留待复现再处理 |
| Key 公开后被滥用 | 已知接受 | 用户已确认 |
| 老用户浏览器缓存旧 dist | 低 | 部署后 hard refresh，或 dist 文件名带 hash（当前未做） |
| SiliconFlow 返回 image URL 而非 b64_json，前端 fetch 该 URL 也被 CORS 拦 | 低-中 | `extractGeneratedImage` 时优先取 `b64_json`；只有 URL 时直接传给 `<img src>`（浏览器图片 CORS 比 fetch 宽松），ticket DOM 渲染不需要 dataURL |

## 测试计划

无自动化测试（本项目无测试框架）。手动验证：

1. **CORS 直连路径**：浏览器 DevTools Network 看到对 `api.siliconflow.cn` 的 POST，状态 200。
2. **CORS 降级路径**：临时 mock SiliconFlow 直连失败，验证自动走 `/api/sf-proxy`，仍能出小票。
3. **超时容错**：跑 5 次连续生成，确认不再出现 504 卡 2/3。
4. **保留功能**：analyze / classify 仍正常（DevTools 看到 200）。
5. **防御性改动**：人为触发一次 504（断网或改坏 URL），确认错误提示是「服务器响应非 JSON：HTTP …」而非 SyntaxError。

## 实现顺序建议

1. `api/sf-token.mjs`
2. `frontend/src/lib/snapRoastPrompts.ts`（搬 prompt + parser）
3. `frontend/src/lib/siliconflow.ts`（含 fallback 路径声明，先不接 sf-proxy）
4. `frontend/src/product.ts` 改 `generateRoast` + `generateSketch` + `postJson` 兜底
5. 本地构建 + 手动验证 → 部署到 Vercel
6. **观察 SiliconFlow 是否开 CORS**：
   - 如果直连 200 → 完工，不需要 sf-proxy
   - 如果直连 TypeError → 加 `api/sf-proxy.mjs` 并实现降级路径
7. 再次部署验证
