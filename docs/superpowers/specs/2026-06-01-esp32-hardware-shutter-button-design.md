# ESP32 硬件快门按钮 — 设计文档

日期：2026-06-01

## 目标

在 ESP32 上接一个物理按键开关模块，按下时让手机 Safari 中打开的 HTTPS 产品页（`https://snap-roast-buddy-delta.vercel.app/`）自动触发 `#shutterButton` 的拍照动作。

## 约束（决定了架构）

1. 产品页跑在 HTTPS Vercel —— 浏览器**无法** `fetch` / `WebSocket` 到 ESP32 的 HTTP（mixed-content 阻断）。
2. 产品页**不能改成本地 HTTP** —— `getUserMedia`（摄像头）只在 HTTPS / localhost 下可用。
3. 手机是 iOS —— Safari **不支持** Web Bluetooth，无法走蓝牙旁路。

结论：纯局域网通信走不通，ESP32 → 浏览器必须借云中转。ESP32 经 iPhone 热点能上外网，可用。

## 方案选型

选定 **MQTT over TLS / WSS + 公共 broker `broker.emqx.io`**：
- ESP32 端走 `mqtts://broker.emqx.io:8883`（原生 TLS，`PubSubClient` 直接用）
- 浏览器端走 `wss://broker.emqx.io:8084/mqtt`（浏览器只能开 WebSocket）
- broker 内部桥接两端协议

未选 Firebase（要建项目 + SDK 重量级）和 Vercel Serverless SSE（长连接不擅长 + 需另加状态层）。

## 架构与数据流

```
[按键模块]──S→GPIO4──┐
                    │
                [ESP32] ──WiFi(经iPhone热点)──► mqtts://broker.emqx.io:8883
                                                        ▲
                                                        │  publish: snap-roast/<TOPIC_ID>/shutter
                                                        │  payload: {"ts": <millis>}
                                                        │
                                                        ▼
                                                  订阅同一 topic
                                                        │
                                            [手机 Safari，HTTPS 产品页]
                                            mqtt.js 收到 → shutterButton.click()
```

### 关键设计点

- **Topic 隔离**：`TOPIC_ID` 用一次性生成的 16 字符随机十六进制串，硬编码到 ESP32 firmware 和前端两边。公共 broker 上靠"猜不到"做轻量级隔离。
- **消息形式**：仅按下事件，payload `{"ts": <ESP32 millis>}`。前端用 `ts` 做幂等去重。
- **QoS = 0**：丢一条无所谓（用户会重按；不过用户场景里"按一次进下一屏"实际不会重按，这里 QoS 0 只是图简单）。
- **retain = false**：避免新订阅者一连上来就吃到陈旧的按键事件。
- **去抖**：仅 ESP32 端 30ms 硬件去抖，消机械按键物理抖动。**不加业务层节流** —— 按一次就进下一屏，shutter 按钮在 DOM 里已不可见，连按无意义。

## 接线

按键模块（3 脚 S/V/G，按下输出高电平）：

| 模块脚 | 接 ESP32 |
|---|---|
| S（信号） | GPIO 4 |
| V（VCC） | **3V3**（不能接 5V/VIN，会烧 GPIO） |
| G（GND） | GND |

避开的脚（已有用途）：
- GPIO 1/2 —— 打印机 RX/TX
- GPIO 41 —— 打印机 DTR

## ESP32 端实现

在现有 [snap_roast_print.ino](../../../hardware/esp32/snap_roast_print/snap_roast_print.ino) 内增量修改，不新建文件。

### 新增依赖（Arduino 库管理器装）
- `PubSubClient`
- `WiFiClientSecure`（ESP32 core 自带）

### 新增全局
```cpp
#define BUTTON_PIN 4
#define DEBOUNCE_MS 30
const char* MQTT_HOST  = "broker.emqx.io";
const int   MQTT_PORT  = 8883;
const char* MQTT_TOPIC = "snap-roast/<16字节随机>/shutter";

WiFiClientSecure mqttNet;
PubSubClient     mqtt(mqttNet);

static int      lastButtonLevel = LOW;
static uint32_t lastEdgeMs      = 0;
```

### setup() 追加
```cpp
pinMode(BUTTON_PIN, INPUT);     // 模块自带下拉，闲置稳定低电平
mqttNet.setInsecure();          // 跳过证书校验：公共 broker 不必校验
mqtt.setServer(MQTT_HOST, MQTT_PORT);
```

### loop() 追加（不阻塞 server.handleClient()）
```cpp
if (!mqtt.connected()) {
  // 非阻塞重连：只尝试一次 connect，失败就让下个 loop tick 再试
  mqtt.connect(("snap-roast-esp32-" + String((uint32_t)ESP.getEfuseMac(), HEX)).c_str());
}
mqtt.loop();

int level = digitalRead(BUTTON_PIN);
uint32_t now = millis();
if (level != lastButtonLevel && (now - lastEdgeMs) > DEBOUNCE_MS) {
  lastEdgeMs = now;
  if (lastButtonLevel == LOW && level == HIGH) {     // 上升沿 = 按下
    char payload[32];
    snprintf(payload, sizeof(payload), "{\"ts\":%lu}", now);
    mqtt.publish(MQTT_TOPIC, payload);
    Serial.printf("按下 → MQTT publish ts=%lu\n", now);
  }
  lastButtonLevel = level;
}
```

⚠️ MQTT 端口选 8883（原生 TLS）而非 8084（WSS）—— `PubSubClient` 跑原生 TLS 比跑 WebSocket-MQTT 简单。浏览器端用 8084 是因为浏览器只能开 WebSocket，broker 自己桥接两端协议。

## 浏览器端实现

改 [frontend/src/product.ts](../../../frontend/src/product.ts)。

### 新增依赖
- `mqtt`（npm 包，浏览器版约 50KB gzipped）

### product.ts 末尾追加
```ts
import mqtt from "mqtt";

const MQTT_TOPIC = "snap-roast/<16字节随机>/shutter";   // 必须和 ESP32 一致
const client = mqtt.connect("wss://broker.emqx.io:8084/mqtt", {
  reconnectPeriod: 3000,
  clean: true,
});

let lastSeenTs = 0;
client.on("connect", () => client.subscribe(MQTT_TOPIC));
client.on("message", (_topic, payload) => {
  try {
    const { ts } = JSON.parse(payload.toString());
    if (typeof ts !== "number" || ts === lastSeenTs) return;
    lastSeenTs = ts;
    shutterButton.click();
  } catch {
    /* 忽略畸形 payload */
  }
});
```

## Topic 生成（一次性）

```bash
node -e "console.log(require('crypto').randomBytes(8).toString('hex'))"
```

把输出粘到 ESP32 和 product.ts 两处 `MQTT_TOPIC` 常量里。

## 测试方案

1. **冒烟测试**：ESP32 串口监视器 + 浏览器 console 同开，按一次按钮 → 两边各打一行日志 → 产品页进入"照片预览/生成中"下一屏。
2. **断连恢复**：把 iPhone 热点临时关 5 秒再开 → MQTT 应自动重连 → 按钮恢复工作。
3. **延迟基线**：按按钮到屏幕进入下屏的肉眼可感延迟，预期 < 500ms。
4. **机械抖动**：按一下只算一次（不会连续触发两屏）。

## 不在范围

- 长按 / 双击 / 多按钮支持
- ESP32 → broker 鉴权（用户名密码 / mTLS）—— 当前靠 topic 名秘密性
- 离线缓存按键事件
