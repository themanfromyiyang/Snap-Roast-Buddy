# ESP32 Hardware Shutter Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ESP32 上接一个物理按键，按下后通过公共 MQTT broker 中转，触发 HTTPS Vercel 产品页中 `#shutterButton` 的拍照动作。

**Architecture:** ESP32 经 iPhone 热点连外网 → 用原生 TLS（端口 8883）publish 到 `broker.emqx.io` → 浏览器用 WebSocket（端口 8084）订阅同一 topic → 收到消息后调用 `shutterButton.click()`。Topic 用 16 字符随机十六进制串硬编码两端，靠不可猜测做轻量隔离。

**Tech Stack:** ESP32 Arduino core, `PubSubClient`, `WiFiClientSecure`, npm `mqtt` 包，esbuild bundling, vanilla TypeScript。

**Spec reference:** [docs/superpowers/specs/2026-06-01-esp32-hardware-shutter-button-design.md](../specs/2026-06-01-esp32-hardware-shutter-button-design.md)

**Testing strategy:** 本项目没有自动化测试框架，硬件代码也无法做单元测试。每个任务以"实现 → 编译/类型检查通过 → 用 MQTT 桌面客户端做闭环 smoke test → commit"为节奏。最后用真实 ESP32 + 真实手机做端到端验证。

---

## Task 0: 生成共享 TOPIC_ID

**Files:** 无文件改动，仅生成一个字符串后续两端复用。

- [ ] **Step 1: 在仓库根目录生成 16 字符随机 hex**

Run:
```bash
node -e "console.log(require('crypto').randomBytes(8).toString('hex'))"
```

Expected output 示例：
```
4f8a2c1d9b7e3a06
```

- [ ] **Step 2: 记下这个值，后续任务里用 `<TOPIC_ID>` 占位代表这个具体字符串**

完整 topic 字符串将是 `snap-roast/4f8a2c1d9b7e3a06/shutter`（用你自己生成的值替换中间段）。

⚠️ 这个值在 Task 1（ESP32）和 Task 3（前端）都要硬编码进源码，**必须完全一致**，否则两端不在同一个 topic 上。

---

## Task 1: ESP32 firmware — MQTT 连接 + 按钮发布

**Files:**
- Modify: `hardware/esp32/snap_roast_print/snap_roast_print.ino`

**Arduino 库依赖**（Arduino IDE → Tools → Manage Libraries 安装）：
- `PubSubClient` by Nick O'Leary
- `WiFiClientSecure` 已包含在 ESP32 core，无需单独装

**接线确认（先做完再烧录）**：
- 按键模块 `S` → ESP32 `GPIO 4`
- 按键模块 `V` → ESP32 `3V3`（**不要接 5V/VIN**，会烧 GPIO）
- 按键模块 `G` → ESP32 任一 `GND`

- [ ] **Step 1: 在 .ino 顶部 `#include <HardwareSerial.h>` 之后添加新 include 和宏**

打开 [hardware/esp32/snap_roast_print/snap_roast_print.ino](../../../hardware/esp32/snap_roast_print/snap_roast_print.ino)，在第 23 行 `#include <HardwareSerial.h>` 之后插入：

```cpp
#include <WiFiClientSecure.h>
#include <PubSubClient.h>

// ---- 硬件快门按钮 + MQTT 中转 ----
#define BUTTON_PIN 4
#define BUTTON_DEBOUNCE_MS 30
const char* MQTT_HOST = "broker.emqx.io";
const int   MQTT_PORT = 8883;                                  // 原生 MQTT over TLS
const char* MQTT_TOPIC = "snap-roast/<TOPIC_ID>/shutter";      // 用 Task 0 生成的值替换 <TOPIC_ID>

static WiFiClientSecure mqttNet;
static PubSubClient     mqtt(mqttNet);

static int      btnLastLevel  = LOW;
static uint32_t btnLastEdgeMs = 0;
static uint32_t mqttLastTryMs = 0;
```

- [ ] **Step 2: 在 .ino 现有静态函数区（约第 78 行 `handleOptions` 上方或下方任意空位）添加 MQTT 重连辅助函数**

```cpp
// 非阻塞重连：每 3 秒最多尝试一次，避免 loop 卡死
static void mqttEnsureConnected() {
  if (mqtt.connected()) return;
  uint32_t now = millis();
  if (now - mqttLastTryMs < 3000) return;
  mqttLastTryMs = now;

  String clientId = "snap-roast-esp32-" + String((uint32_t)ESP.getEfuseMac(), HEX);
  Serial.print("MQTT 连接中... ");
  if (mqtt.connect(clientId.c_str())) {
    Serial.println("OK");
  } else {
    Serial.print("失败, state=");
    Serial.println(mqtt.state());
  }
}

// 上升沿 = 按下，发布一次按键事件
static void buttonPoll() {
  int level = digitalRead(BUTTON_PIN);
  uint32_t now = millis();
  if (level != btnLastLevel && (now - btnLastEdgeMs) > BUTTON_DEBOUNCE_MS) {
    btnLastEdgeMs = now;
    if (btnLastLevel == LOW && level == HIGH) {
      char payload[32];
      snprintf(payload, sizeof(payload), "{\"ts\":%lu}", now);
      bool ok = mqtt.publish(MQTT_TOPIC, payload);
      Serial.printf("按下 → publish %s (ok=%d)\n", payload, ok ? 1 : 0);
    }
    btnLastLevel = level;
  }
}
```

- [ ] **Step 3: 在 `setup()` 函数末尾（`server.begin();` 后面，约第 464 行）追加初始化**

找到 `setup()` 中 `Serial.println("浏览器访问: http://...");` 之后，函数 `}` 之前的位置，追加：

```cpp
  pinMode(BUTTON_PIN, INPUT);          // 模块自带下拉
  mqttNet.setInsecure();               // 跳过证书校验：公共 broker 不必校验
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  Serial.println("MQTT 客户端已初始化, topic=" + String(MQTT_TOPIC));
```

- [ ] **Step 4: 在 `loop()` 中追加 MQTT 维护 + 按钮轮询**

`loop()` 当前只有 `server.handleClient();`。改为：

```cpp
void loop() {
  server.handleClient();
  mqttEnsureConnected();
  mqtt.loop();
  buttonPoll();
}
```

- [ ] **Step 5: Arduino IDE 编译验证（不烧录）**

Arduino IDE → Sketch → Verify/Compile（或 Ctrl+R）。

Expected: 编译成功，输出大致 `Sketch uses XXXXX bytes (XX%) of program storage space`。

如报 `WiFiClientSecure.h: No such file or directory` → 检查 Board 是否选了 ESP32 系列。
如报 `PubSubClient.h: No such file or directory` → 库没装，回到顶部"Arduino 库依赖"步骤。

- [ ] **Step 6: 烧录到 ESP32 并打开串口监视器（115200 波特率）**

Expected 串口输出顺序：
```
正在连接热点...
已连接！
ESP32 IP: 172.20.10.x
HTTP server 已启动 (端口 80)
浏览器访问: http://172.20.10.x/
MQTT 客户端已初始化, topic=snap-roast/<TOPIC_ID>/shutter
MQTT 连接中... OK
```

如看到 `MQTT 连接中... 失败, state=-2` → 网络/DNS 问题，确认 iPhone 热点能上外网。
如循环打印失败 → 等 30 秒，公共 broker 偶尔抖动，会自愈。

- [ ] **Step 7: 用 MQTT 桌面客户端做单端 smoke test**

下载安装 [MQTTX](https://mqttx.app/)（或任何能连 wss MQTT 的客户端）。

新建连接：
- Name: `emqx-public-test`
- Host: `broker.emqx.io`
- Port: `8084`
- Path: `/mqtt`
- SSL/TLS: ON
- Protocol: `mqtt/wss` (or "WebSocket")

连接后订阅 topic `snap-roast/<TOPIC_ID>/shutter`。

按一下硬件按钮 → MQTTX 应在订阅面板收到一条消息，payload 形如 `{"ts":12345}`。

ESP32 串口同时打印 `按下 → publish {"ts":12345} (ok=1)`。

如串口打印 `ok=0` → MQTT 当前未连接（看 ESP32 是否还在打"失败"），等连上再按。
如订阅端收不到但串口 ok=1 → 检查 topic 字符串两端是否完全一致（包括随机 ID 段）。

- [ ] **Step 8: 验证去抖 — 单按一次只产生一条消息**

按按钮一下，订阅面板应**只增加 1 条**消息（不是 2/3 条）。如果连出多条，物理抖动没被吃掉，把 `BUTTON_DEBOUNCE_MS` 加大到 50。

- [ ] **Step 9: Commit**

```bash
git add hardware/esp32/snap_roast_print/snap_roast_print.ino
git commit -m "feat(esp32): publish shutter button press over MQTT"
```

---

## Task 2: 前端 — 安装 `mqtt` npm 依赖

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`（自动）

- [ ] **Step 1: 安装 mqtt 包**

仓库根目录运行：

```bash
npm install mqtt
```

Expected: `package.json` 的 `dependencies` 字段新增 `"mqtt": "^5.x.x"`（具体版本号以当时为准）。

- [ ] **Step 2: 验证类型检查仍通过**

```bash
npm run check
```

Expected: 无输出（tsc --noEmit 成功）。

如有 mqtt 类型相关报错 → mqtt 包自带 `.d.ts`，无需额外 `@types/mqtt`。看报错确认是不是 TS 项目配置问题。

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add mqtt for browser MQTT subscriber"
```

---

## Task 3: 前端 — 在 product.ts 订阅 MQTT，触发 shutterButton.click()

**Files:**
- Modify: `frontend/src/product.ts`（在文件末尾追加，不修改现有逻辑）

- [ ] **Step 1: 在 [product.ts](../../../frontend/src/product.ts) 文件顶部 import 区添加 mqtt import**

`product.ts` 当前顶部有若干 import。在最后一条 import 后插入：

```ts
import mqtt from "mqtt/dist/mqtt.esm.js";
```

⚠️ 必须用子路径 `mqtt/dist/mqtt.esm.js` 而不是裸 `from "mqtt"`，因为 mqtt 包默认入口是 Node 版本（依赖 Node 内置模块如 `tls`/`net`），esbuild 浏览器构建会失败或产生超大 bundle。子路径是 mqtt 官方提供的浏览器优化构建。

- [ ] **Step 2: 在 product.ts 文件最末尾追加 MQTT 订阅代码**

把以下整块加到文件末尾（注意 `shutterButton` 是 product.ts 顶层已声明的 const，可直接引用）：

```ts
// ---- 硬件快门按钮：订阅 ESP32 经 MQTT 中转的按下事件 ----
const SHUTTER_MQTT_TOPIC = "snap-roast/<TOPIC_ID>/shutter";   // 必须和 ESP32 firmware 一致
const shutterMqttClient = mqtt.connect("wss://broker.emqx.io:8084/mqtt", {
  reconnectPeriod: 3000,
  clean: true,
});

let lastShutterTs = 0;
shutterMqttClient.on("connect", () => {
  shutterMqttClient.subscribe(SHUTTER_MQTT_TOPIC, (err) => {
    if (err) console.error("[shutter-mqtt] subscribe failed", err);
    else console.log("[shutter-mqtt] subscribed to", SHUTTER_MQTT_TOPIC);
  });
});
shutterMqttClient.on("message", (_topic, payload) => {
  try {
    const { ts } = JSON.parse(payload.toString()) as { ts?: number };
    if (typeof ts !== "number" || ts === lastShutterTs) return;
    lastShutterTs = ts;
    console.log("[shutter-mqtt] press received, ts=", ts);
    shutterButton.click();
  } catch (e) {
    console.warn("[shutter-mqtt] bad payload", e);
  }
});
shutterMqttClient.on("error", (e) => console.error("[shutter-mqtt] error", e));
```

把 `<TOPIC_ID>` 替换为 Task 0 生成的字符串，**必须和 Task 1 步 1 里的值完全一致**。

- [ ] **Step 3: 类型检查**

```bash
npm run check
```

Expected: 无输出，成功。

如报 `Cannot find module "mqtt/dist/mqtt.esm.js"` → mqtt 包结构变了，运行 `ls node_modules/mqtt/dist/` 看实际文件名，调整 import 路径。

- [ ] **Step 4: 构建打包**

```bash
npm run build:frontend
```

Expected: 无错误，`frontend/dist/product.js` 文件更新（体积会增大约 30-60 KB，因为 mqtt 浏览器版打进了 bundle）。

如 esbuild 报 `Could not resolve "tls"/"net"/"fs"` → 说明 import 写成了裸 `from "mqtt"` 而不是 `from "mqtt/dist/mqtt.esm.js"`，回到 Step 1 改正。

- [ ] **Step 5: 本地启动 dev 服务器**

```bash
npm run dev
```

Expected: backend/server.mjs 启动，打印监听端口（如 `http://localhost:3000` 之类）。

- [ ] **Step 6: 桌面 Chrome 单端 smoke test**

桌面 Chrome 打开 `http://localhost:<port>/product.html`（或对应路径，根据 backend/server.mjs 路由）。

打开 DevTools Console，应看到：
```
[shutter-mqtt] subscribed to snap-roast/<TOPIC_ID>/shutter
```

回到 Task 1 Step 7 的 MQTTX 客户端，**反方向**测试：在 MQTTX 里向 topic `snap-roast/<TOPIC_ID>/shutter` 发布消息 `{"ts": 99999}`（payload 类型选 JSON 或 Plain text 都可以）。

Expected：
- 浏览器 Console 输出 `[shutter-mqtt] press received, ts= 99999`
- 紧接着产品页"拍照"动作被触发（因为是桌面 Chrome 没摄像头权限，可能看到 `cameraStream` 相关错误 / 进入"无法打开摄像头"提示 —— 这是符合预期的，说明 `shutterButton.click()` 已成功调用了 `captureFromCamera()`）

如发送两次同 `ts` → 第二次会被去重，Console 静默。把 `ts` 改成新值再发，应再次触发。

- [ ] **Step 7: 验证断连恢复**

在 MQTTX 里点"断开连接"再"重连"（模拟网络抖动）；或者直接关掉 Chrome DevTools Network 用 Offline 模式 5 秒再恢复。

Expected: Console 出现 `[shutter-mqtt] error ...` 然后 `[shutter-mqtt] subscribed to ...` 重新出现，再次发消息能触发。

- [ ] **Step 8: Commit**

```bash
git add frontend/src/product.ts frontend/dist/product.js
git commit -m "feat(product): trigger shutter from ESP32 button via MQTT relay"
```

---

## Task 4: 端到端真机集成验证

**Files:** 无代码改动，纯验证。

- [ ] **Step 1: 部署前端到 Vercel preview**

把当前分支 push 到 GitHub（如果还没 push）：
```bash
git push -u origin bitmap
```

Vercel 自动构建 preview。等 Vercel 通知 deployment ready，记下 preview URL（形如 `https://snap-roast-buddy-delta-<hash>.vercel.app`）。

如不便用 preview，也可以直接 push 到 main / 让 Vercel 部署到生产 URL —— 用户原本就是用 `https://snap-roast-buddy-delta.vercel.app/`。

- [ ] **Step 2: 在 iPhone 上打开产品页**

iPhone 开热点 `iPhone on the beach`，确认热点能上网。
ESP32 上电（应自动连热点 + 连 MQTT broker，串口会打印连接日志）。
iPhone Safari 打开 preview URL（或生产 URL）→ 走到拍照页面（能看到 shutter 按钮）。

iPhone Safari 开 Web Inspector（需要先在 Mac 上启用，否则跳过 console 验证，直接看 UI 行为）。

- [ ] **Step 3: 按硬件按钮 — 端到端验证**

按一下物理按键。

Expected：
- ESP32 串口打印 `按下 → publish {"ts":XXXXX} (ok=1)`
- iPhone 产品页拍照动作触发：拍下当前画面 → 进入下一屏（预览或自动进生成流程，取决于 `settings.triggerMode`）

时间从按下到 UI 进下屏，肉眼应在 1 秒内。

- [ ] **Step 4: 边缘场景验证**

依次跑这几个场景：

1. **重复按键**：在拍照页连按两下（每下间隔 < 100ms）→ 因物理上拍完一张就离开拍照页，第二条 MQTT 消息触发的 `shutterButton.click()` 因为按钮不在 DOM 可见区或 `isGenerating` 守卫 ([product.ts:420](../../../frontend/src/product.ts#L420))，被静默忽略。结果：和按一次相同，没有多拍 / 多次进流程。

2. **断开重连**：关 iPhone 热点 5 秒再开 → ESP32 串口应打印重连失败再连上 → 按按钮再次正常工作。

3. **页面切换后再回来**：把 Safari 切到后台 30 秒（iOS Safari 会暂停 WebSocket），再切回来 → mqtt 客户端 `reconnectPeriod: 3000` 应在 3 秒内重连 → 按按钮再次正常工作。如果发现重连后第一条消息丢失，是因为 ESP32 端没缓存；这是已知的 QoS 0 行为，重按一次即可。

- [ ] **Step 5: 不需要额外 commit（无代码改动）**

如果在 Step 4 发现需要调参（去抖时长、重连周期），改 Task 1 / Task 3 对应代码并补一个修复 commit。

---

## 完成

到此功能可用。如要做 follow-up，候选项：
- 把 `<TOPIC_ID>` 移到环境变量 / 配置文件，避免硬编码到源码（提交时容易泄露到 git history）
- 给 MQTT 连接加用户名/密码鉴权（EMQX 公共 broker 支持，但需注册账号）
- 让 ESP32 在 publish 失败时短暂亮 LED 指示
