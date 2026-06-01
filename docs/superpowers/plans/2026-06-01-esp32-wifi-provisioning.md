# ESP32 WiFi Provisioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 ESP32 WiFi 凭据从源码硬编码改成运行时配网。无凭据/连不上时自动开 `SnapRoast-Setup` AP 热点 + captive portal 配网页；长按按钮 5 秒清配置重新配网。

**Architecture:** ESP32 启动 → 读 NVS → 有则尝试 STA 连接 15 秒 → 成功就跑原有 HTTP/MQTT 栈，失败就开 AP 模式（DNSServer catch-all + WebServer 提供扫描/保存页）。AP 模式下用户在配网页选 WiFi 输密码 → 写 NVS → `ESP.restart()` 走 STA 流程。

**Tech Stack:** ESP32 Arduino core 自带 `Preferences`、`DNSServer`、`WebServer`、`WiFi`；无新增第三方库。

**Spec reference:** [docs/superpowers/specs/2026-06-01-esp32-wifi-provisioning-design.md](../specs/2026-06-01-esp32-wifi-provisioning-design.md)

**Testing strategy:** 嵌入式 .ino 没有自动化测试。每个任务节奏：实现 → Arduino IDE 编译通过 → commit；关键里程碑（Task 7/8/9 完成后）烧录真机做闭环 smoke test。最终用 spec 测试计划里的 7 条手工验收走一遍。

**File 结构:**
- Modify: [hardware/esp32/snap_roast_print/snap_roast_print.ino](../../../hardware/esp32/snap_roast_print/snap_roast_print.ino) — 单文件重构，所有改动集中在此
- Create: `hardware/esp32/snap_roast_print/README.md` — 用户使用说明

---

## Task 0: 添加 includes 和全局变量

**Files:** Modify [hardware/esp32/snap_roast_print/snap_roast_print.ino:22-26](../../../hardware/esp32/snap_roast_print/snap_roast_print.ino#L22-L26)

- [ ] **Step 1: 在 includes 块追加两个头文件**

在 `#include <PubSubClient.h>` 之后追加：

```cpp
#include <Preferences.h>
#include <DNSServer.h>
```

（这两个都是 ESP32 core 自带，无需安装库。）

- [ ] **Step 2: 在按钮/MQTT 全局变量附近（[L38-L40](../../../hardware/esp32/snap_roast_print/snap_roast_print.ino#L38-L40) 之后）追加配网相关全局**

```cpp
// ---- WiFi 配网相关 ----
static Preferences prefs;
static DNSServer   dnsServer;
static bool        inApMode = false;
static const uint32_t LONG_PRESS_MS = 5000;
static uint32_t btnPressStartMs = 0;
static bool     longPressFired  = false;
static const uint32_t STA_CONNECT_TIMEOUT_MS = 15000;
static const char* AP_SSID = "SnapRoast-Setup";
```

- [ ] **Step 3: Arduino IDE 编译验证**

打开 [snap_roast_print.ino](../../../hardware/esp32/snap_roast_print/snap_roast_print.ino) → Verify。预期：编译成功，警告允许，错误不允许。

- [ ] **Step 4: Commit**

```bash
git add hardware/esp32/snap_roast_print/snap_roast_print.ino
git commit -m "chore(esp32): add Preferences/DNSServer includes and provisioning globals"
```

---

## Task 1: WiFi 凭据持久化 4 个函数

**Files:** Modify [hardware/esp32/snap_roast_print/snap_roast_print.ino](../../../hardware/esp32/snap_roast_print/snap_roast_print.ino)

- [ ] **Step 1: 在 `HardwareSerial Printer(1);` 之前（约 [L69](../../../hardware/esp32/snap_roast_print/snap_roast_print.ino#L69)）插入凭据存取函数**

```cpp
// ---- WiFi 凭据持久化（NVS / Preferences namespace="wifi"） ----
static String loadSavedSsid() {
  return prefs.getString("ssid", "");
}
static String loadSavedPass() {
  return prefs.getString("pass", "");
}
static void saveCreds(const String& ssid, const String& pass) {
  prefs.putString("ssid", ssid);
  prefs.putString("pass", pass);
  Serial.print("已保存 SSID: ");
  Serial.println(ssid);
}
static void clearCreds() {
  prefs.remove("ssid");
  prefs.remove("pass");
  Serial.println("已清除保存的 WiFi 凭据");
}
```

- [ ] **Step 2: 在 setup() 开头（[L484](../../../hardware/esp32/snap_roast_print/snap_roast_print.ino#L484) `delay(500);` 之后）追加 `prefs.begin`**

```cpp
  prefs.begin("wifi", /*readOnly=*/false);
```

- [ ] **Step 3: 编译验证**

Arduino IDE → Verify。预期：成功（这些函数还没人调用，是 dead code，但 ESP32 编译器允许）。

- [ ] **Step 4: Commit**

```bash
git add hardware/esp32/snap_roast_print/snap_roast_print.ino
git commit -m "feat(esp32): add NVS-backed WiFi credential helpers"
```

---

## Task 2: AP 模式骨架（softAP + DNS + catch-all 重定向）

**Files:** Modify [hardware/esp32/snap_roast_print/snap_roast_print.ino](../../../hardware/esp32/snap_roast_print/snap_roast_print.ino)

这一步只搭骨架：开热点、起 DNS、注册占位 `/` handler 和 catch-all。完整配网页 HTML 在 Task 3 替换。

- [ ] **Step 1: 在凭据函数后追加 AP 模式占位 handler 和 enterApMode 函数**

```cpp
// ---- AP 模式：配网 Web handler ----
static void handleConfigRoot() {
  sendCors();
  server.send(200, "text/html; charset=utf-8",
              "<!doctype html><meta charset=utf-8><h1>SnapRoast 配网</h1><p>占位页（Task 3 替换）</p>");
}

// catch-all：iOS/Android captive portal 探测域名都重定向到 /
static void handleCaptiveRedirect() {
  server.sendHeader("Location", "http://192.168.4.1/", true);
  server.send(302, "text/plain", "");
}

static void enterApMode() {
  inApMode = true;
  Serial.println("==== 进入 AP 配网模式 ====");

  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID);    // 开放无密码
  IPAddress apIp = WiFi.softAPIP();
  Serial.print("AP IP: ");
  Serial.println(apIp);

  // DNS 把所有域名解析到 AP IP，触发 captive portal 弹窗
  dnsServer.start(53, "*", apIp);

  // 只注册配网相关路由；打印路由在 AP 模式下不可用
  server.on("/", HTTP_GET, handleConfigRoot);
  server.onNotFound(handleCaptiveRedirect);
  server.begin();
  Serial.println("配网 HTTP server 已启动");
  Serial.println("浏览器访问 http://192.168.4.1/");
}
```

- [ ] **Step 2: 编译验证**

Arduino IDE → Verify。预期：成功，仍是 dead code。

- [ ] **Step 3: Commit**

```bash
git add hardware/esp32/snap_roast_print/snap_roast_print.ino
git commit -m "feat(esp32): scaffold AP-mode entry with softAP, DNS catch-all and placeholder root"
```

---

## Task 3: 完整配网页 HTML（替换占位 handleConfigRoot）

**Files:** Modify [hardware/esp32/snap_roast_print/snap_roast_print.ino](../../../hardware/esp32/snap_roast_print/snap_roast_print.ino)

- [ ] **Step 1: 替换 Task 2 的占位 handleConfigRoot 为完整页面**

把整个 `handleConfigRoot` 函数体替换成：

```cpp
static void handleConfigRoot() {
  sendCors();
  String html;
  html.reserve(4096);
  html += "<!doctype html><html lang=\"zh-CN\"><head>";
  html += "<meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">";
  html += "<title>Snap Roast · 配置 WiFi</title><style>";
  html += "*{box-sizing:border-box}body{font-family:-apple-system,'PingFang SC',sans-serif;padding:20px;max-width:480px;margin:0 auto;background:#f7f7f7;color:#222}";
  html += "h1{font-size:20px;margin:8px 0 16px}";
  html += ".panel{background:#fff;padding:16px;border-radius:10px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.06)}";
  html += ".list{max-height:240px;overflow:auto;border:1px solid #eee;border-radius:8px}";
  html += ".item{padding:10px 12px;border-bottom:1px solid #f0f0f0;cursor:pointer;display:flex;justify-content:space-between;align-items:center}";
  html += ".item:last-child{border-bottom:none}.item:active{background:#eef}.item.sel{background:#e6f0ff}";
  html += ".rssi{color:#888;font-size:12px}";
  html += "label{display:block;font-size:13px;color:#666;margin-top:10px}";
  html += "input{width:100%;padding:10px;font-size:15px;border:1px solid #ddd;border-radius:6px;margin-top:4px}";
  html += "button{width:100%;padding:12px;font-size:15px;border:none;border-radius:8px;background:#06f;color:#fff;margin-top:16px;cursor:pointer}";
  html += "button.secondary{background:#888;margin-top:8px}.muted{color:#666;font-size:13px;margin-top:8px}";
  html += "#status{margin-top:12px;font-size:13px;color:#06a}#status.err{color:#c00}";
  html += "</style></head><body>";
  html += "<h1>Snap Roast Buddy · 配置 WiFi</h1>";
  html += "<div class=\"panel\"><div>附近的 WiFi（点击选择）：</div>";
  html += "<div id=\"list\" class=\"list\"><div class=\"muted\" style=\"padding:12px\">扫描中...</div></div>";
  html += "<button class=\"secondary\" onclick=\"loadScan()\">🔄 重新扫描</button></div>";
  html += "<div class=\"panel\">";
  html += "<label>已选 SSID</label><input id=\"ssid\" placeholder=\"点上面列表，或手动输入\">";
  html += "<label>密码</label><input id=\"pass\" type=\"password\" placeholder=\"WiFi 密码\">";
  html += "<button onclick=\"save()\">保存并连接</button>";
  html += "<div id=\"status\"></div></div>";
  html += "<script>";
  html += "const $=(id)=>document.getElementById(id);";
  html += "async function loadScan(){const l=$('list');l.innerHTML='<div class=\"muted\" style=\"padding:12px\">扫描中...</div>';";
  html += "try{const r=await fetch('/scan');const arr=await r.json();";
  html += "if(!arr.length){l.innerHTML='<div class=\"muted\" style=\"padding:12px\">未扫描到 WiFi</div>';return;}";
  html += "l.innerHTML='';arr.forEach(n=>{const d=document.createElement('div');d.className='item';";
  html += "d.innerHTML='<span>📶 '+n.ssid.replace(/</g,'&lt;')+'</span><span class=\"rssi\">'+n.rssi+' dBm</span>';";
  html += "d.onclick=()=>{document.querySelectorAll('.item').forEach(x=>x.classList.remove('sel'));d.classList.add('sel');$('ssid').value=n.ssid;$('pass').focus();};";
  html += "l.appendChild(d);});}catch(e){l.innerHTML='<div class=\"muted err\" style=\"padding:12px\">扫描失败: '+e.message+'</div>';}}";
  html += "async function save(){const s=$('status');s.classList.remove('err');";
  html += "const ssid=$('ssid').value.trim();const pass=$('pass').value;";
  html += "if(!ssid){s.textContent='请先选择或输入 SSID';s.classList.add('err');return;}";
  html += "s.textContent='保存中...';";
  html += "try{const r=await fetch('/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ssid,pass})});";
  html += "if(!r.ok){const t=await r.text();s.textContent='保存失败 HTTP '+r.status+': '+t;s.classList.add('err');return;}";
  html += "document.body.innerHTML='<h1>✅ 已保存</h1><div class=\"panel\"><p>设备即将重启并连接 <b>'+ssid+'</b>。</p><p>请把手机 WiFi 切回原热点，等设备约 15 秒。</p></div>';";
  html += "}catch(e){s.textContent='请求出错: '+e.message;s.classList.add('err');}}";
  html += "loadScan();";
  html += "</script></body></html>";
  server.send(200, "text/html; charset=utf-8", html);
}
```

- [ ] **Step 2: 编译验证**

Arduino IDE → Verify。预期：成功（`String.reserve(4096)` 在 4MB flash ESP32 上 RAM 足够）。

- [ ] **Step 3: Commit**

```bash
git add hardware/esp32/snap_roast_print/snap_roast_print.ino
git commit -m "feat(esp32): implement full WiFi config page UI"
```

---

## Task 4: /scan 端点

**Files:** Modify [hardware/esp32/snap_roast_print/snap_roast_print.ino](../../../hardware/esp32/snap_roast_print/snap_roast_print.ino)

- [ ] **Step 1: 在 `handleCaptiveRedirect` 之前追加 `handleScan`**

```cpp
// 扫描周围 WiFi，返回 JSON 数组 [{ssid,rssi}]，按 RSSI 降序去重
static void handleScan() {
  sendCors();
  Serial.println("/scan 开始扫描...");
  int n = WiFi.scanNetworks(/*async=*/false, /*show_hidden=*/false);
  Serial.printf("/scan 扫到 %d 个网络\n", n);

  // 去重：同 SSID 保留最强 RSSI。简单 O(n^2) 即可，n 通常 < 30。
  String resp = "[";
  bool first = true;
  for (int i = 0; i < n; i++) {
    String s = WiFi.SSID(i);
    if (s.length() == 0) continue;
    int32_t rssi = WiFi.RSSI(i);
    bool dup = false;
    for (int j = 0; j < i; j++) {
      if (WiFi.SSID(j) == s && WiFi.RSSI(j) >= rssi) { dup = true; break; }
    }
    if (dup) continue;
    if (!first) resp += ",";
    first = false;
    // SSID 转 JSON 字符串：转义 \ " 和控制字符
    String esc;
    esc.reserve(s.length() + 4);
    for (size_t k = 0; k < s.length(); k++) {
      char c = s[k];
      if (c == '\\' || c == '"') { esc += '\\'; esc += c; }
      else if ((uint8_t)c < 0x20) { /* 跳过控制字符 */ }
      else esc += c;
    }
    resp += "{\"ssid\":\"" + esc + "\",\"rssi\":" + String((int)rssi) + "}";
  }
  resp += "]";
  WiFi.scanDelete();
  server.send(200, "application/json", resp);
}
```

- [ ] **Step 2: 在 enterApMode 里注册 /scan 路由**

修改 enterApMode 函数体里 `server.on("/", HTTP_GET, handleConfigRoot);` 这一行**之后**，`server.onNotFound(...)` **之前**，插入：

```cpp
  server.on("/scan", HTTP_GET, handleScan);
```

- [ ] **Step 3: 编译验证**

Arduino IDE → Verify。预期：成功。

- [ ] **Step 4: Commit**

```bash
git add hardware/esp32/snap_roast_print/snap_roast_print.ino
git commit -m "feat(esp32): implement /scan endpoint listing nearby WiFi"
```

---

## Task 5: /save 端点（写 NVS + 重启）

**Files:** Modify [hardware/esp32/snap_roast_print/snap_roast_print.ino](../../../hardware/esp32/snap_roast_print/snap_roast_print.ino)

- [ ] **Step 1: 在 `handleScan` 之后追加 `handleSave`**

```cpp
// 解析 POST body JSON {"ssid":"...","pass":"..."}，写 NVS 后 1.5s 重启。
// 手写极小 JSON 解析：只处理两个 string 字段，不依赖 ArduinoJson 库。
static String jsonExtractString(const String& body, const char* key) {
  String needle = String("\"") + key + "\"";
  int kp = body.indexOf(needle);
  if (kp < 0) return "";
  int colon = body.indexOf(':', kp + needle.length());
  if (colon < 0) return "";
  int q1 = body.indexOf('"', colon + 1);
  if (q1 < 0) return "";
  String out;
  out.reserve(64);
  for (int i = q1 + 1; i < (int)body.length(); i++) {
    char c = body[i];
    if (c == '\\' && i + 1 < (int)body.length()) {
      char n = body[++i];
      if      (n == 'n')  out += '\n';
      else if (n == 't')  out += '\t';
      else if (n == 'r')  out += '\r';
      else                out += n;     // \\ \" \/ 等都按字面下一字符处理
    } else if (c == '"') {
      return out;
    } else {
      out += c;
    }
  }
  return "";  // 找不到收尾引号
}

static void handleSave() {
  sendCors();
  String body = server.arg("plain");
  Serial.print("/save body 长度: ");
  Serial.println(body.length());

  String ssid = jsonExtractString(body, "ssid");
  String pass = jsonExtractString(body, "pass");
  if (ssid.length() == 0) {
    server.send(400, "text/plain", "missing ssid");
    return;
  }
  saveCreds(ssid, pass);
  server.send(200, "text/plain", "ok");
  Serial.println("1.5 秒后重启...");
  delay(1500);
  ESP.restart();
}
```

- [ ] **Step 2: 在 enterApMode 里注册 POST /save**

在 `server.on("/scan", ...)` 之后插入：

```cpp
  server.on("/save", HTTP_POST,    handleSave);
  server.on("/save", HTTP_OPTIONS, handleOptions);
```

- [ ] **Step 3: 编译验证**

Arduino IDE → Verify。预期：成功。

- [ ] **Step 4: Commit**

```bash
git add hardware/esp32/snap_roast_print/snap_roast_print.ino
git commit -m "feat(esp32): implement /save endpoint persisting creds and rebooting"
```

---

## Task 6: tryConnectSavedWiFi + enterStaMode（提取现有 STA 初始化）

**Files:** Modify [hardware/esp32/snap_roast_print/snap_roast_print.ino](../../../hardware/esp32/snap_roast_print/snap_roast_print.ino)

把现有 setup() 里 STA 连接逻辑和路由/MQTT 注册提取成两个函数。

- [ ] **Step 1: 在 enterApMode 之前添加 tryConnectSavedWiFi**

```cpp
// 用 NVS 里保存的账密尝试 STA 连接，timeoutMs 内成功返回 true
static bool tryConnectSavedWiFi(uint32_t timeoutMs) {
  String s = loadSavedSsid();
  String p = loadSavedPass();
  if (s.length() == 0) return false;

  WiFi.mode(WIFI_STA);
  WiFi.begin(s.c_str(), p.c_str());
  Serial.print("尝试连接 ");
  Serial.print(s);
  Serial.print(" ");
  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - start > timeoutMs) {
      Serial.println(" 超时");
      WiFi.disconnect(true);
      return false;
    }
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("已连接！ESP32 IP: ");
  Serial.println(WiFi.localIP());
  return true;
}
```

- [ ] **Step 2: 在 tryConnectSavedWiFi 之后添加 enterStaMode**

把现有 setup() 中 [L499-L519](../../../hardware/esp32/snap_roast_print/snap_roast_print.ino#L499-L519) 路由注册 + MQTT 初始化代码搬过来：

```cpp
// STA 模式下注册全部打印路由 + 初始化 MQTT
static void enterStaMode() {
  inApMode = false;

  server.on("/",      HTTP_GET,     handleRoot);
  server.on("/ping",  HTTP_GET,     handlePing);
  server.on("/print", HTTP_GET,     handlePrintGet);
  server.on("/print", HTTP_POST,    handlePrintPost);
  server.on("/print", HTTP_OPTIONS, handleOptions);
  server.on("/print-raster", HTTP_POST,    handlePrintRaster);
  server.on("/print-raster", HTTP_OPTIONS, handleOptions);
  server.on("/print-chunk",  HTTP_POST,    handlePrintChunk);
  server.on("/print-chunk",  HTTP_OPTIONS, handleOptions);
  server.on("/print-bridge", HTTP_GET,     handlePrintBridge);
  server.onNotFound([]() {
    sendCors();
    server.send(404, "text/plain", "Not found");
  });
  server.begin();
  Serial.println("HTTP server 已启动 (端口 80)");
  Serial.println("浏览器访问: http://" + WiFi.localIP().toString() + "/");

  mqttNet.setInsecure();
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  Serial.println("MQTT 客户端已初始化, topic=" + String(MQTT_TOPIC));
}
```

- [ ] **Step 3: 编译验证**

Arduino IDE → Verify。预期：成功（这两个函数还没被调用，是 dead code）。

- [ ] **Step 4: Commit**

```bash
git add hardware/esp32/snap_roast_print/snap_roast_print.ino
git commit -m "refactor(esp32): extract STA connect/init into tryConnectSavedWiFi + enterStaMode"
```

---

## Task 7: 重写 setup() — 删硬编码，加 dispatch

**Files:** Modify [hardware/esp32/snap_roast_print/snap_roast_print.ino](../../../hardware/esp32/snap_roast_print/snap_roast_print.ino)

这是激活节点。完成后整条新链路（NVS → 尝试 STA → 失败开 AP → 配网页保存 → 重启）就跑通了。

- [ ] **Step 1: 删除硬编码 ssid/password 常量**

删掉 [L42-L43](../../../hardware/esp32/snap_roast_print/snap_roast_print.ino#L42-L43)：

```cpp
const char* ssid     = "iPhone on the beach";
const char* password = "Qwer123321";
```

- [ ] **Step 2: 重写整个 setup() 函数**

把现有 setup() 整体替换为：

```cpp
void setup() {
  Serial.begin(115200);
  pinMode(DTR_PIN, INPUT_PULLUP);
  pinMode(BUTTON_PIN, INPUT);
  Printer.begin(57600, SERIAL_8N1, 1, 2);  // RX=1, TX=2
  delay(500);

  prefs.begin("wifi", /*readOnly=*/false);

  String savedSsid = loadSavedSsid();
  if (savedSsid.length() > 0 && tryConnectSavedWiFi(STA_CONNECT_TIMEOUT_MS)) {
    enterStaMode();
  } else {
    Serial.println(savedSsid.length() == 0
                   ? "NVS 无 WiFi 凭据 → 进 AP 配网"
                   : "保存的 WiFi 连不上 → 进 AP 配网");
    enterApMode();
  }
}
```

注意：原 setup() 里 `pinMode(BUTTON_PIN, INPUT)` 在 [L516](../../../hardware/esp32/snap_roast_print/snap_roast_print.ino#L516) 偏后；新版本提前到顶部和 DTR_PIN 一起，避免下面分支前需要按钮就绪。`prefs.begin` 来自 Task 1 — 把 Task 1 加进去的那行 `prefs.begin(...)` 删掉，因为这里已经包含了。

- [ ] **Step 3: 编译验证**

Arduino IDE → Verify。预期：成功。

- [ ] **Step 4: Smoke test — 烧录到真机做首次配网**

烧录新固件 → 打开 Arduino 串口监视器（115200 baud）。预期看到：
```
NVS 无 WiFi 凭据 → 进 AP 配网
==== 进入 AP 配网模式 ====
AP IP: 192.168.4.1
配网 HTTP server 已启动
```

用手机 WiFi 设置连 `SnapRoast-Setup`（开放无密码）。**注意：** 此刻 loop() 还是旧版本，DNS 还不会被轮询，captive portal 弹窗不会自动起来，需要在浏览器手动访问 `http://192.168.4.1`。

浏览器打开 `http://192.168.4.1`：
- 应看到配网页 UI
- 列表自动加载附近 WiFi（10 秒内）
- 点列表项 → SSID 填入
- 输入正确密码 → 点保存
- 串口应打印 `已保存 SSID: ...` `1.5 秒后重启...`
- 设备重启 → 串口应看到 `尝试连接 ... 已连接！ESP32 IP: 192.168.x.x`

若以上全部通过 → 配网主流程已工作。若任一步失败：
- 列表空：检查串口 `WiFi.scanNetworks` 返回的 n
- 保存后未重启：检查串口 `/save body 长度` 是否非零
- 重启后连不上：可能密码输错；等 15 秒应回 AP 模式

- [ ] **Step 5: Commit**

```bash
git add hardware/esp32/snap_roast_print/snap_roast_print.ino
git commit -m "feat(esp32): replace hardcoded WiFi with NVS-backed boot dispatch"
```

---

## Task 8: 重写 loop() 按模式分支 + DNS 轮询

**Files:** Modify [hardware/esp32/snap_roast_print/snap_roast_print.ino:522-527](../../../hardware/esp32/snap_roast_print/snap_roast_print.ino#L522-L527)

- [ ] **Step 1: 整体替换 loop()**

```cpp
void loop() {
  if (inApMode) {
    dnsServer.processNextRequest();
    server.handleClient();
    // AP 模式下按钮无功能（长按重置只在 STA 模式有意义；
    // AP 模式本身就是"重置后的状态"，再触发 reset 也是回到这里）
  } else {
    server.handleClient();
    mqttEnsureConnected();
    mqtt.loop();
    buttonPoll();   // 暂时仍调用旧版，Task 9 替换为 buttonPollStaMode
  }
}
```

- [ ] **Step 2: 编译验证**

Arduino IDE → Verify。预期：成功。

- [ ] **Step 3: Smoke test — captive portal 自动弹窗**

擦掉 NVS（在串口监视器输入框前手动复位，或加一次性 `clearCreds()` 调用后撤回，或直接物理按到 Task 9 实现的长按 — 现在还没有，可以临时用 Erase Flash 烧录方式）。简单办法：Arduino IDE → Tools → Erase All Flash Before Sketch Upload → Enabled → 烧录一次 → 改回 Disabled。

设备进 AP 模式 → 手机连 `SnapRoast-Setup`：
- iPhone：应在几秒内**自动弹出**配网页（系统的 captive portal 探测）
- Android：通知栏应出现 "登录到 WiFi 网络" 提示，点击进配网页

走完配网流程，重启后用浏览器访问 `http://<ESP32 STA IP>/ping` → 应返回 `pong`。

- [ ] **Step 4: Commit**

```bash
git add hardware/esp32/snap_roast_print/snap_roast_print.ino
git commit -m "feat(esp32): branch loop() by AP/STA mode, drive DNS in AP mode"
```

---

## Task 9: buttonPoll 拆分（buttonPollStaMode 长按重置 + buttonPollApMode noop）

**Files:** Modify [hardware/esp32/snap_roast_print/snap_roast_print.ino:464-478](../../../hardware/esp32/snap_roast_print/snap_roast_print.ino#L464-L478)

- [ ] **Step 1: 整体替换原 buttonPoll 函数**

把 [L464-L478](../../../hardware/esp32/snap_roast_print/snap_roast_print.ino#L464-L478) 的 `static void buttonPoll() { ... }` 替换为：

```cpp
// STA 模式：边沿检测短按发布 MQTT；持续按下 5s 触发长按 → 清 NVS + 重启
static void buttonPollStaMode() {
  int level = digitalRead(BUTTON_PIN);
  uint32_t now = millis();

  // 上升沿（按下瞬间）
  if (level == HIGH && btnLastLevel == LOW && (now - btnLastEdgeMs) > BUTTON_DEBOUNCE_MS) {
    btnLastEdgeMs   = now;
    btnPressStartMs = now;
    longPressFired  = false;
    btnLastLevel    = HIGH;
    return;
  }

  // 持续按下 → 检查是否达到长按阈值
  if (level == HIGH && btnLastLevel == HIGH && !longPressFired) {
    if ((now - btnPressStartMs) >= LONG_PRESS_MS) {
      longPressFired = true;
      Serial.println("长按 5s → 清 WiFi 配置并重启");
      clearCreds();
      delay(200);
      ESP.restart();
    }
    return;
  }

  // 下降沿（松开）
  if (level == LOW && btnLastLevel == HIGH && (now - btnLastEdgeMs) > BUTTON_DEBOUNCE_MS) {
    btnLastEdgeMs = now;
    btnLastLevel  = LOW;
    if (!longPressFired) {
      // 短按 → 原 MQTT 快门发布逻辑
      char payload[32];
      snprintf(payload, sizeof(payload), "{\"ts\":%lu}", now);
      bool ok = mqtt.publish(MQTT_TOPIC, payload);
      Serial.printf("短按 → publish %s (ok=%d)\n", payload, ok ? 1 : 0);
    }
    return;
  }
}
```

- [ ] **Step 2: 删除原 buttonPoll 函数**

确认 Step 1 替换的就是 [L464-L478](../../../hardware/esp32/snap_roast_print/snap_roast_print.ino#L464-L478) 整个 `buttonPoll` 函数。已删除则跳过。

- [ ] **Step 3: 更新 loop() 调用名**

把 Task 8 里 loop() STA 分支中的 `buttonPoll();` 改成 `buttonPollStaMode();`：

```cpp
  } else {
    server.handleClient();
    mqttEnsureConnected();
    mqtt.loop();
    buttonPollStaMode();
  }
```

- [ ] **Step 4: 编译验证**

Arduino IDE → Verify。预期：成功，无未引用符号。

- [ ] **Step 5: Smoke test — 长按重置**

烧录新固件。前置：设备已配网，处于 STA 模式正常打印。

测试：
1. 短按按钮 → 串口应看到 `短按 → publish ... (ok=1)`，Vercel 页面应触发拍照/打印（视当前界面）
2. 按住按钮不放，数 5 秒（实际触发约在第 5 秒）→ 串口应看到：
   ```
   长按 5s → 清 WiFi 配置并重启
   已清除保存的 WiFi 凭据
   ```
   → 设备重启 → 因 NVS 已清 → 进 AP 模式
3. 在松开按钮的瞬间，确认**不会**额外发布 MQTT 短按事件（看串口）

如果第 1 步重复短按发现 MQTT 没发：先检查 STA 是否连着、MQTT 是否连着；与本任务无关。

- [ ] **Step 6: Commit**

```bash
git add hardware/esp32/snap_roast_print/snap_roast_print.ino
git commit -m "feat(esp32): long-press 5s clears WiFi creds; short press unchanged"
```

---

## Task 10: 用户文档

**Files:** Create `hardware/esp32/snap_roast_print/README.md`

- [ ] **Step 1: 创建 README.md**

文件内容：

```markdown
# Snap Roast Print · ESP32 固件

## 首次使用 / 换 WiFi

通电后等约 15 秒。设备若连不上保存的 WiFi（首次烧录时无任何保存），会自动开热点 `SnapRoast-Setup`（无密码）。

1. 用手机 WiFi 设置连 `SnapRoast-Setup`
2. iOS/Android 通常会**自动弹出**配网页；若没弹出，浏览器访问 `http://192.168.4.1`
3. 页面会列出附近 WiFi，点击你的手机热点/家用 WiFi
4. 输入密码 → 点"保存并连接"
5. 设备会自动重启并连上目标 WiFi，约 15 秒后正常工作

之后**不会再出现**配网页，每次开机自动连接保存的 WiFi。

## 强制重新配网（换手机时）

设备运行时**长按硬件按钮 5 秒**，串口会打印 `长按 5s → 清 WiFi 配置并重启`，设备会清除已保存的 WiFi 凭据并重启进入配网热点模式，按上面流程重新配置即可。

## 密码输错

如果配网时密码输错：设备保存后重启 → 15 秒内连不上 → 自动回到 AP 配网模式。重连 `SnapRoast-Setup` 重新输入即可。

## 工作流程提示

- **AP 模式下打印、MQTT 快门按钮都不工作**——这是配网专用模式
- 配网成功 STA 模式下，硬件按钮短按仍按原有逻辑发布 MQTT（相机界面拍照 / 结果界面打印）
- 工作中 WiFi 临时掉线，设备会后台自动重连，**不会**进 AP 模式

## 常见问题

- **iPhone 配网热点连不上目标 WiFi**：iPhone 个人热点关掉"最大兼容性"时只广播 5GHz，ESP32 大多只支持 2.4GHz。打开"最大兼容性"再保存。
- **AP 模式下扫描列表为空**：手机端刷新页面（右上角"重新扫描"按钮）；若仍为空，重启设备。
```

- [ ] **Step 2: Commit**

```bash
git add hardware/esp32/snap_roast_print/README.md
git commit -m "docs(esp32): user guide for WiFi provisioning and long-press reset"
```

---

## Task 11: 端到端验收

**Files:** 无改动，仅手工测试

按 [spec 测试计划](../specs/2026-06-01-esp32-wifi-provisioning-design.md) 的 7 条逐项过：

- [ ] **1. 首次烧录**：Arduino IDE 启用 Erase All Flash → 烧录 → 串口 `NVS 无 WiFi 凭据` → AP 起 → 手机连 `SnapRoast-Setup` → 自动弹页 → 选 WiFi 输密码 → 保存 → 重启 → STA 连上并打印 IP
- [ ] **2. 正常重启**：复位按钮 → 15 秒内连上 → `http://<IP>/ping` 返回 `pong`；MQTT 串口看到 `MQTT 连接中... OK`
- [ ] **3. 保存的 WiFi 不可达**：关掉手机热点 → 复位 ESP32 → 串口 15 秒后 `保存的 WiFi 连不上 → 进 AP 配网` → 进 AP
- [ ] **4. 密码错误回退**：清 NVS → 配网时故意输错密码 → 重启 → 15 秒超时 → 自动回 AP
- [ ] **5. 长按重置**：STA 模式中长按 5 秒 → 串口确认清配置+重启 → 进 AP
- [ ] **6. 短按打印不受影响**：STA 模式下短按 → MQTT publish ok → Vercel 端触发对应屏幕动作
- [ ] **7. 打印功能回归**：STA 模式下从 Vercel 页面打印一张位图 → `/print-chunk` 走通 → 打印机出纸

全部通过即可视为本次实施完成。
