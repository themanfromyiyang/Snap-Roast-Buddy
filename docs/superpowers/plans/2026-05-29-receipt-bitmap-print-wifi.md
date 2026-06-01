# 小票位图打印（WiFi 路径）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把当前商品页 WiFi 打印从「文本透传」替换为「整张小票截图位图打印」，让漫画、大字、版式都能上纸。

**Architecture:** 复用 `frontend/src/lib/printer.ts` 里已有的 `canvasToEscPosRaster()`（原本只接到 BLE 通道）。前端把小票 DOM 截图 → 单色 raster 字节 → 分块 base64 → 动态隐藏 `<form>` POST 顶层跳转到 `http://<esp32-ip>/print-raster`，绕过 HTTPS→HTTP fetch 的 mixed-content 拦截。ESP32 端流式 base64 解码（每解 3 字节立刻 `Printer.write()`，不缓存），透传给热敏打印机。

**Tech Stack:** TypeScript（esbuild bundle）、Arduino C++（ESP32-S3 N16R8）、ESC/POS `GS v 0` 命令、Web Bluetooth API（不动）

**Spec:** [docs/superpowers/specs/2026-05-29-receipt-bitmap-print-wifi-design.md](../specs/2026-05-29-receipt-bitmap-print-wifi-design.md)

---

## 文件改动地图

**Modify:**
- `frontend/src/lib/printer.ts` — `elementToCanvas` 从内部函数改 export；新增 `bytesToBase64(bytes)` 分块编码工具
- `frontend/src/product.ts` — 重写 823-950 行 ESP32 WiFi 打印段，从文本 GBK 改为 raster base64 form-POST
- `frontend/index.html` — 删 cputils.js / cp936.js 两行 `<script>` 标签（主页不再需要 GBK 编码）
- `hardware/esp32/snap_roast_print/snap_roast_print.ino` — 新增 `handlePrintRaster()` 和路由注册

**Do not touch:**
- `frontend/src/lib/printer.ts` 其他部分（BLE 路径继续用）
- `frontend/print-test.html`、`frontend/test.html`、`frontend/vendor/cputils.js`、`frontend/vendor/cp936.js`（文本调试通道保留）
- ESP32 sketch 现有 `GET /print?text=`、`POST /print`、`GET /`、`GET /ping`、OPTIONS 端点

**Testing note:** 项目无自动化测试 runner（package.json 只有 `tsc --noEmit` 类型检查和 esbuild 打包）。本计划用 `npm run check` 做类型门禁，Arduino IDE 编译做 sketch 门禁，浏览器控制台手动验证 base64 编码工具的正确性，端到端验证靠物理打印机。

---

### Task 1: 把 `elementToCanvas` 从内部函数改为 export

**Files:**
- Modify: `frontend/src/lib/printer.ts:152`

- [ ] **Step 1: 改函数签名加 `export`**

打开 `frontend/src/lib/printer.ts`，把第 152 行：

```ts
async function elementToCanvas(element: HTMLElement) {
```

改成：

```ts
export async function elementToCanvas(element: HTMLElement) {
```

其它不动（函数体保持原样）。

- [ ] **Step 2: 类型检查**

Run: `npm run check`
Expected: 无报错（`tsc --noEmit` 退出码 0）

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/printer.ts
git commit -m "refactor(printer): export elementToCanvas for reuse in WiFi path"
```

---

### Task 2: 在 `printer.ts` 新增分块 base64 编码工具

**目的：** 一次 `btoa(String.fromCharCode(...bigArray))` 在大数组上会栈溢出。我们要个工具把 `Uint8Array` 分 8KB 块编码再拼接。

**Files:**
- Modify: `frontend/src/lib/printer.ts`（末尾追加导出函数）

- [ ] **Step 1: 在 printer.ts 末尾追加 `bytesToBase64`**

在文件末尾（`delay` 函数之后）追加：

```ts
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    let chunkStr = "";
    for (let j = 0; j < slice.length; j += 1) {
      chunkStr += String.fromCharCode(slice[j]);
    }
    binary += chunkStr;
  }
  return btoa(binary);
}
```

- [ ] **Step 2: 类型检查**

Run: `npm run check`
Expected: 无报错

- [ ] **Step 3: 浏览器控制台手动验证**

启动 dev：`npm run dev`，浏览器开 http://localhost:3000/product.html（或主页），打开 DevTools Console，粘贴以下脚本：

```js
const { bytesToBase64 } = await import("/dist/product.js").catch(() => null) || {};
// 退路：从已加载的模块直接 import
const printer = await import("/src/lib/printer.js").catch(async () => {
  // 走 bundle 路径
  return null;
});
// 直接构造一个跟实现等价的临时函数验证：
function bytesToBase64Test(bytes) {
  const CHUNK = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    let chunkStr = "";
    for (let j = 0; j < slice.length; j += 1) chunkStr += String.fromCharCode(slice[j]);
    binary += chunkStr;
  }
  return btoa(binary);
}
// Case 1: 空数组
console.assert(bytesToBase64Test(new Uint8Array([])) === "", "empty");
// Case 2: 'Hi' → 'SGk='
console.assert(bytesToBase64Test(new Uint8Array([0x48, 0x69])) === "SGk=", "Hi");
// Case 3: 跨块（10KB 全 0xAA）和原生 btoa 等价
const big = new Uint8Array(10240).fill(0xAA);
let s = ""; for (let i = 0; i < big.length; i++) s += String.fromCharCode(0xAA);
console.assert(bytesToBase64Test(big) === btoa(s), "10KB chunked equals naive");
console.log("bytesToBase64 verified");
```

Expected: 控制台输出 `bytesToBase64 verified`，无 assert 失败。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/printer.ts
git commit -m "feat(printer): add chunked bytesToBase64 utility"
```

---

### Task 3: 重写 `product.ts` 里的 WiFi 打印分支（文本 → 位图）

**Files:**
- Modify: `frontend/src/product.ts:823-950`

- [ ] **Step 1: 找到当前小票 DOM 元素的来源**

在文件里 `currentRecordIndex` 状态和 `ticketLongPreview`（[product.ts:140](../../../frontend/src/product.ts#L140)）已有。要打印的就是 `ticketLongPreview` 里第一个 `.product-paper` 子元素（它是按当前记录渲染的小票纸面）。

- [ ] **Step 2: 改 import 头部，引入位图工具**

打开 `frontend/src/product.ts`，找到顶部已有的 import 区域。增加（如果还没引入这些符号）：

```ts
import { bytesToBase64, canvasToEscPosRaster, elementToCanvas } from "./lib/printer.js";
```

如果文件里已经有从 `./lib/printer.js` 的 import 语句，把这三个符号合并进去；如果没有，加这一整行（位置参照其他 import）。

- [ ] **Step 3: 把 823-950 行整段替换**

把第 823 行 `// === ESP32 WiFi 打印 ===...` 到第 950 行 `// === /ESP32 WiFi 打印 ===...` 整段（包括 `cptable` 声明、`encodeTextAsGbkPercent`、`triggerPrint`、`attachPrintButtonHandlers`、`hasPrintableText`、`getPrintableTextFromCurrentRecord`），替换为：

```ts
// === ESP32 WiFi 打印（位图路径）======================================
// HTTPS 页面不能 fetch 一个 HTTP 资源（mixed content），但顶层 form 提交
// 浏览器放行（会弹一次"提交不安全表单"警告）。所以走：
//   小票 DOM → canvas → ESC/POS GS v 0 字节 → 分块 base64 → 隐藏 form POST 顶层跳转
// ESP32 端流式 base64 解码，直接喂打印机，整张小票位图上纸。
//
// 旧文本透传通道（GET /print?text=）保留在 print-test.html 里调试用，本页面不再走那条。

const ESP32_IP_STORAGE_KEY = "snap_roast_esp32_ip";
const PRINT_LONG_PRESS_MS = 900;

function getStoredEsp32Ip(): string {
  try {
    return (localStorage.getItem(ESP32_IP_STORAGE_KEY) ?? "").trim();
  } catch {
    return "";
  }
}

function setStoredEsp32Ip(ip: string): void {
  try {
    if (ip) localStorage.setItem(ESP32_IP_STORAGE_KEY, ip);
    else localStorage.removeItem(ESP32_IP_STORAGE_KEY);
  } catch {
    // localStorage 不可用，跳过
  }
}

function normalizeIp(raw: string): string {
  return raw.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

function askForEsp32Ip(current: string): string {
  const hint =
    "请输入 ESP32 的 IP（在 Arduino 串口监视器里能看到，一般是 172.20.10.X）。\n" +
    "留空可清除已保存的 IP。";
  const next = window.prompt(hint, current);
  if (next === null) return current;
  const normalized = normalizeIp(next);
  setStoredEsp32Ip(normalized);
  return normalized;
}

function getCurrentTicketElement(): HTMLElement | null {
  // ticketLongPreview 是当前记录渲染出的那张小票，product-paper 是纸面外壳
  const paper = ticketLongPreview.querySelector<HTMLElement>(".product-paper");
  return paper ?? null;
}

async function buildRasterBase64(element: HTMLElement): Promise<string> {
  const canvas = await elementToCanvas(element);
  const raster = canvasToEscPosRaster(canvas, 180);
  return bytesToBase64(raster);
}

function submitRasterToEsp32(ip: string, base64: string): void {
  // 顶层 form POST，浏览器会弹一次警告，用户确认后跳转到 ESP32 的"已打印"页
  const form = document.createElement("form");
  form.method = "POST";
  form.action = `http://${ip}/print-raster`;
  form.enctype = "application/x-www-form-urlencoded";
  form.acceptCharset = "utf-8";
  // 用 target=_blank 新标签页打开，避免离开当前相册页（跟原文本路径行为一致）
  form.target = "_blank";

  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "data";
  input.value = base64;
  form.appendChild(input);

  document.body.appendChild(form);
  form.submit();
  // 提交完移除，避免 DOM 污染
  document.body.removeChild(form);
}

async function triggerPrint(): Promise<void> {
  const ticketEl = getCurrentTicketElement();
  if (!ticketEl) {
    window.alert("当前没有可打印的小票。");
    return;
  }

  let ip = getStoredEsp32Ip();
  if (!ip) ip = askForEsp32Ip("");
  if (!ip) return;

  let base64: string;
  try {
    base64 = await buildRasterBase64(ticketEl);
  } catch (err) {
    window.alert("生成打印位图失败：" + (err instanceof Error ? err.message : String(err)));
    return;
  }

  softHaptic();
  try {
    submitRasterToEsp32(ip, base64);
  } catch (err) {
    window.alert("提交到 ESP32 失败：" + (err instanceof Error ? err.message : String(err)));
  }
}

function attachPrintButtonHandlers(): void {
  let longPressTimer = 0;
  let longPressFired = false;

  const startLongPress = () => {
    longPressFired = false;
    window.clearTimeout(longPressTimer);
    longPressTimer = window.setTimeout(() => {
      longPressFired = true;
      askForEsp32Ip(getStoredEsp32Ip());
    }, PRINT_LONG_PRESS_MS);
  };
  const cancelLongPress = () => {
    window.clearTimeout(longPressTimer);
  };

  printButton.addEventListener("pointerdown", startLongPress);
  printButton.addEventListener("pointerup", cancelLongPress);
  printButton.addEventListener("pointerleave", cancelLongPress);
  printButton.addEventListener("pointercancel", cancelLongPress);

  printButton.addEventListener("click", (event) => {
    if (longPressFired) {
      event.preventDefault();
      longPressFired = false;
      return;
    }
    void triggerPrint();
  });
}
// === /ESP32 WiFi 打印（位图路径）=====================================
```

- [ ] **Step 4: 找按钮 disable 条件并放宽**

第 973 行附近：

```ts
printButton.disabled = !printableRecord || !hasPrintableText(printableRecord);
```

位图路径下不再要求 `ticketText`（漫画/big_text 模式没文本但有视觉），改为：

```ts
printButton.disabled = !printableRecord;
```

如果 `hasPrintableText` 在文件别处还有用，保留；如果只有这一处引用，可以连同 `getPrintableTextFromCurrentRecord` 一起删（在 Step 3 替换时已经被替换掉了，这里只需要确认 disable 条件就行）。

- [ ] **Step 5: 类型检查**

Run: `npm run check`
Expected: 无报错。如果报 `hasPrintableText` / `getPrintableTextFromCurrentRecord` / `encodeTextAsGbkPercent` / `cptable` 未使用警告，按上面 Step 3 注释处理（这些符号在替换段里已全部移除）。如果还有引用，把那些引用也删干净。

- [ ] **Step 6: 打包**

Run: `npm run build:frontend`
Expected: `frontend/dist/product.js` 重新生成，无错误。

- [ ] **Step 7: Commit**

```bash
git add frontend/src/product.ts
git commit -m "feat(product): replace WiFi text print with raster bitmap form POST"
```

---

### Task 4: 主页面 `index.html` 删除 GBK 编码脚本

**Files:**
- Modify: `frontend/index.html:8-11`

- [ ] **Step 1: 删两行 script 标签和注释**

打开 `frontend/index.html`，删除第 8-11 行：

```html
    <!-- UTF-8 → GBK 编码（codepage 936），用于 ESP32 打印按钮把中文文本透传到打印机
         本地托管避免 CDN 在国内被墙；先加载码表数据，再加载 utils -->
    <script src="./vendor/cp936.js"></script>
    <script src="./vendor/cputils.js"></script>
```

主页位图路径不再需要 GBK 编码库；`print-test.html` 和 `test.html` 仍保留这两行（不要动那两个文件）。

- [ ] **Step 2: 浏览器加载验证**

启动 dev：`npm run dev`，访问主商品页，打开 DevTools Network 面板刷新，确认 `cp936.js` 和 `cputils.js` 不再被请求，控制台无 `cptable is not defined` 类报错。

- [ ] **Step 3: Commit**

```bash
git add frontend/index.html
git commit -m "chore(index): drop GBK encoder scripts from main product page"
```

---

### Task 5: ESP32 sketch 新增流式 base64 解码器和 `/print-raster` 处理函数

**Files:**
- Modify: `hardware/esp32/snap_roast_print/snap_roast_print.ino`

- [ ] **Step 1: 在 `handlePrintGet` 之后追加流式 base64 解码工具**

打开 `hardware/esp32/snap_roast_print/snap_roast_print.ino`，在第 136 行 `handlePrintGet` 结束后、`void setup()` 之前，插入：

```cpp
// ---- base64 流式解码：每解一字节立刻 Printer.write，不缓存解码后的数据 ----
// 字母表索引：A-Z (0-25), a-z (26-51), 0-9 (52-61), '+' (62), '/' (63)
// 返回 -1 表示非字母表字符（空格/换行/=padding/控制字符），调用方跳过
static int base64Index(char c) {
  if (c >= 'A' && c <= 'Z') return c - 'A';
  if (c >= 'a' && c <= 'z') return c - 'a' + 26;
  if (c >= '0' && c <= '9') return c - '0' + 52;
  if (c == '+') return 62;
  if (c == '/') return 63;
  return -1;
}

// 把 base64 串流式解码并立刻发给 Printer，返回真实输出的字节数
static size_t streamBase64ToPrinter(const String& b64) {
  uint32_t buf = 0;     // 累计 6-bit 单元的缓冲（最多 24 bit）
  int bits = 0;         // 当前缓冲里有效 bit 数
  size_t outBytes = 0;
  for (size_t i = 0; i < b64.length(); i++) {
    char c = b64[i];
    if (c == '=') break;          // padding 表示输入结束
    int v = base64Index(c);
    if (v < 0) continue;          // 跳过空白和非字母表字符
    buf = (buf << 6) | (uint32_t)v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      uint8_t byte = (uint8_t)((buf >> bits) & 0xFF);
      Printer.write(byte);
      outBytes++;
    }
  }
  return outBytes;
}

// ---- POST /print-raster：form 字段 data=<base64(ESC/POS raster 字节流)> ----
static void handlePrintRaster() {
  sendCors();
  if (!server.hasArg("data")) {
    server.send(400, "text/html; charset=utf-8",
                "<!doctype html><meta charset=utf-8><p>缺少 data 字段</p>");
    return;
  }

  const String& b64 = server.arg("data");
  Serial.println();
  Serial.println("==== 收到位图打印请求 ====");
  Serial.print("base64 长度: ");
  Serial.println(b64.length());

  // 初始化打印机（ESC @）
  Printer.write(0x1B);
  Printer.write(0x40);
  delay(50);

  size_t printedBytes = streamBase64ToPrinter(b64);

  // 走纸
  Printer.write('\n');
  Printer.write('\n');
  Printer.write('\n');

  Serial.print("已发字节数: ");
  Serial.println(printedBytes);
  Serial.println("=========================");

  // 返回"已打印"HTML（结构沿用 doPrint(returnHtml=true)）
  String html;
  html.reserve(512);
  html += "<!doctype html><html lang=\"zh-CN\"><head>";
  html += "<meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">";
  html += "<title>已打印</title><style>";
  html += "body{font-family:-apple-system,'PingFang SC',sans-serif;padding:24px;max-width:520px;margin:0 auto;background:#f7f7f7}";
  html += ".ok{font-size:28px;color:#0a0}h1{margin:8px 0}";
  html += ".panel{background:#fff;padding:16px;border-radius:8px;margin-top:16px;box-shadow:0 1px 3px rgba(0,0,0,.06)}";
  html += ".meta{color:#666;font-size:13px;margin-top:8px}a{display:inline-block;margin-top:18px;color:#06f}";
  html += "</style></head><body>";
  html += "<div class=\"ok\">✅ 已打印</div>";
  html += "<h1>ESP32 已发位图到打印机</h1>";
  html += "<div class=\"panel\"><div class=\"meta\">base64 字符数：" + String(b64.length()) + "</div>";
  html += "<div class=\"meta\">解码后字节数：" + String(printedBytes) + "</div></div>";
  html += "<a href=\"javascript:history.back()\">← 返回浏览器上一页</a>";
  html += "</body></html>";
  server.send(200, "text/html; charset=utf-8", html);
}
```

- [ ] **Step 2: Arduino IDE 编译验证**

在 Arduino IDE 中选板子 "ESP32S3 Dev Module"（或你已经在用的板子配置），点 Verify（编译，不上传）。
Expected: 编译成功，无 error。Warning 可以忽略，但 error 必须为 0。

- [ ] **Step 3: Commit**

```bash
git add hardware/esp32/snap_roast_print/snap_roast_print.ino
git commit -m "feat(esp32): add streaming base64 decoder for raster print"
```

---

### Task 6: ESP32 sketch 在 `setup()` 注册新端点

**Files:**
- Modify: `hardware/esp32/snap_roast_print/snap_roast_print.ino:156-160`

- [ ] **Step 1: 在路由表里加一行**

找到 `setup()` 函数里这段（原来在 156-160 行附近）：

```cpp
  server.on("/",      HTTP_GET,     handleRoot);
  server.on("/ping",  HTTP_GET,     handlePing);
  server.on("/print", HTTP_GET,     handlePrintGet);
  server.on("/print", HTTP_POST,    handlePrintPost);
  server.on("/print", HTTP_OPTIONS, handleOptions);
```

在 `/print` HTTP_OPTIONS 之后追加两行：

```cpp
  server.on("/print-raster", HTTP_POST,    handlePrintRaster);
  server.on("/print-raster", HTTP_OPTIONS, handleOptions);
```

- [ ] **Step 2: 编译并上传**

Arduino IDE 中选好串口，点 Upload。
Expected: 上传成功，串口监视器（115200 baud）开机后能看到：
```
正在连接热点...
已连接！
ESP32 IP: 172.20.10.X
HTTP server 已启动 (端口 80)
浏览器访问: http://172.20.10.X/
```

- [ ] **Step 3: 端点 ping 自检**

浏览器访问 `http://<esp32-ip>/` 看到状态页；访问 `http://<esp32-ip>/ping` 返回 `pong`。
确认新端点存在：用 curl 或 PowerShell 发一个空请求：

```powershell
curl.exe -X POST "http://<esp32-ip>/print-raster" -d "data="
```
Expected: ESP32 串口打印 `==== 收到位图打印请求 ====`、`base64 长度: 0`、`已发字节数: 0`，打印机走 3 行纸（空白）。浏览器收到 "已打印" 页。

- [ ] **Step 4: Commit**

```bash
git add hardware/esp32/snap_roast_print/snap_roast_print.ino
git commit -m "feat(esp32): register /print-raster endpoint"
```

---

### Task 7: 端到端手动验证

**目标：** 在真实硬件上跑通整条链路。无自动化测试，必须人工验证视觉结果。

- [ ] **Step 1: 准备**
  - ESP32 已上传 Task 5/6 后的 sketch，已连上手机热点，已知 IP
  - 前端已 `npm run build:frontend`（或 Vercel 部署最新分支）
  - 热敏打印机供电、上纸、串口接好

- [ ] **Step 2: 走完一次商品识别流程**

打开 https://snap-roast-buddy-delta.vercel.app/ （或本地构建产物），拍照/上传一张商品图，等待 AI 吐槽 + 小票渲染完成。

- [ ] **Step 3: 长按打印按钮设置 IP（如果还没设过）**

长按打印按钮 ~1 秒，弹出 prompt 填 ESP32 IP，确认。

- [ ] **Step 4: 点打印**

点打印按钮。浏览器**应弹出**"提交不安全表单"警告，点"继续"/"确认"。新标签页打开 ESP32 的 "已打印" 页。

- [ ] **Step 5: 验收**

打印机出纸应包含：
- AI 吐槽文案（位图渲染，不再依赖打印机字库）
- 商品图 / 漫画插画（如果当前小票模式包含）
- 大字标题（按屏幕上看到的字号比例）
- 整体版式、装饰元素跟屏幕预览**视觉一致**

ESP32 串口监视器应看到：
- `==== 收到位图打印请求 ====`
- `base64 长度: <几万>`
- `已发字节数: <base64 长度 * 0.75 左右>`

- [ ] **Step 6: 边界检查**
  - 切换到「漫画贴纸」模式（之前因为没 ticketText 打印按钮会 disable），现在按钮应该可用，打印出纸为整张漫画
  - 切换到「大字 / big_text」模式，打印出纸大字清晰
  - 极长小票（多次重生成累积）打印不截断

- [ ] **Step 7: 失败回滚（如出问题）**

任一步失败：在 Task 3 的 commit 上 `git revert`，主分支即回到旧文本透传行为。ESP32 端 Task 5/6 不影响旧端点（旧 `POST /print` 仍可用），不需要 revert。

- [ ] **Step 8: 如果一切正常，关闭计划**

无 commit 步骤，本任务是纯验证。

---

## Self-Review 备忘

- ✅ Spec 每个章节都有对应 Task：架构（Task 3）、组件改动前端（Task 1-4）、组件改动 ESP32（Task 5-6）、数据流细节（Task 2 base64 编码 + Task 5 base64 解码）、测试方案（Task 7）
- ✅ 无 TBD / TODO / "类似 Task N" / "适当错误处理" 占位
- ✅ 类型一致：`bytesToBase64(bytes: Uint8Array)`、`canvasToEscPosRaster(canvas)`、`elementToCanvas(element)` 在 Task 1/2/3 中签名一致
- ✅ ESP32 端 `handlePrintRaster` 函数名在 Task 5 定义、Task 6 注册时一致
- ✅ 风险与回滚（spec 提到）→ Task 7 Step 7 明确给了回滚路径
