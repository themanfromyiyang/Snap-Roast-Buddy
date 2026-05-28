// Snap Roast Buddy - ESP32 打印固件
//
// 主入口（v2 位图链路）：
//   GET /print-image?token=xxx
//     ESP32 用 HTTPS 拉 https://snap-roast-buddy-delta.vercel.app/api/print-bitmap?token=xxx
//     拉回的字节流前 4 字节是 W/H（小端），剩下是 1bpp 位图
//     按 256 行一片发 ESC/POS GS v 0，写到打印机
//     完成后返回 HTML 确认页给浏览器
//
// 诊断端点（v1 文本链路遗留，留作调链路）：
//   GET  /print?text=...    URL 参数文本（GBK %XX 已编码）
//   POST /print             body 是纯文本
//   GET  /print-gbk-test    硬编码打 "中文测试"，检测打印机字库
//   GET  /ping              浏览器/curl 健康探测
//   GET  /                  状态页
//
// 接线：
//   打印机 TX → ESP32 GPIO1 (RX)
//   打印机 RX → ESP32 GPIO2 (TX)
//   打印机 VH → 独立 5-9V 电源（不要从 ESP32 取电）
//   打印机 GND ↔ ESP32 GND 共地

#include <WiFi.h>
#include <WebServer.h>
#include <HardwareSerial.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include "secrets.h"   // 定义 WIFI_SSID / WIFI_PASSWORD，已 .gitignore，不会进仓库

const char* ssid     = WIFI_SSID;
const char* password = WIFI_PASSWORD;

// Vercel 主域名，固定在固件里（你的生产域名）
const char* VERCEL_HOST = "snap-roast-buddy-delta.vercel.app";

HardwareSerial Printer(1);
WebServer server(80);

static void sendCors() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
}

static void handleOptions() {
  sendCors();
  server.send(204);
}

static void handleRoot() {
  sendCors();
  String html;
  html.reserve(512);
  html += "<!doctype html><meta charset=\"utf-8\"><h1>Snap Roast Print</h1>";
  html += "<p>IP: " + WiFi.localIP().toString() + "</p>";
  html += "<p>RSSI: " + String(WiFi.RSSI()) + " dBm</p>";
  html += "<ul>";
  html += "<li>GET  /print-image?token=... <b>（主流程，位图）</b></li>";
  html += "<li>GET  /print?text=...        （文本诊断）</li>";
  html += "<li>POST /print  body=text/plain （文本诊断）</li>";
  html += "<li><a href=\"/print-gbk-test\">GET /print-gbk-test</a>  字库诊断</li>";
  html += "</ul>";
  server.send(200, "text/html; charset=utf-8", html);
}

// 诊断：用硬编码的 GBK 字节打 "中文测试"，检测打印机是否支持 GBK 字库
static void handleGbkTest() {
  sendCors();

  Printer.write(0x1B); Printer.write(0x40);   // ESC @ 初始化
  delay(50);
  Printer.write(0x1C); Printer.write(0x26);   // FS &  进入中文模式（常见 GBK 双字节模式）

  // "中文测试" 的 GBK 字节
  static const uint8_t gbk[] = {
    0xD6, 0xD0,   // 中
    0xCE, 0xC4,   // 文
    0xB2, 0xE2,   // 测
    0xCA, 0xD4,   // 试
    0x0A
  };
  Printer.write(gbk, sizeof(gbk));

  Printer.write((const uint8_t*)"ASCII line OK\n", 14);
  Printer.write('\n'); Printer.write('\n'); Printer.write('\n');

  Serial.println("GBK 测试已发送，看打印纸第一行：");
  Serial.println("  - 打出 '中文测试' = 支持 GBK，走 GBK 转码路线");
  Serial.println("  - 仍然乱码        = 只有 ASCII，必须走位图路线");

  String html;
  html.reserve(1024);
  html += "<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\">";
  html += "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">";
  html += "<title>GBK 字库诊断</title>";
  html += "<style>body{font-family:-apple-system,'PingFang SC',sans-serif;padding:24px;max-width:520px;margin:0 auto;background:#f7f7f7}";
  html += ".panel{background:#fff;padding:16px;border-radius:8px;margin-top:14px;box-shadow:0 1px 3px rgba(0,0,0,.06)}";
  html += ".good{color:#0a0;font-weight:600}.bad{color:#a30;font-weight:600}";
  html += "</style></head><body>";
  html += "<h1>GBK 诊断已发送</h1>";
  html += "<div class=\"panel\"><p>检查打印纸的<b>第一行</b>：</p>";
  html += "<p><span class=\"good\">✅ 打出 \"中文测试\"</span> → 打印机有 GBK 字库，走 <b>UTF-8→GBK 转码</b>路线（简单快）</p>";
  html += "<p><span class=\"bad\">❌ 仍然乱码</span> → 打印机只认 ASCII，必须走 <b>1bpp 位图</b>路线（万能但工作量大）</p></div>";
  html += "<p><a href=\"javascript:history.back()\">← 返回</a></p>";
  html += "</body></html>";
  server.send(200, "text/html; charset=utf-8", html);
}

static void handlePing() {
  sendCors();
  server.send(200, "text/plain", "pong");
}

static String htmlEscape(const String& s) {
  String r;
  r.reserve(s.length() + 16);
  for (size_t i = 0; i < s.length(); i++) {
    char c = s[i];
    if      (c == '&')  r += "&amp;";
    else if (c == '<')  r += "&lt;";
    else if (c == '>')  r += "&gt;";
    else if (c == '"')  r += "&quot;";
    else if (c == '\n') r += "<br>";
    else                r += c;
  }
  return r;
}

static void doPrint(const String& text, bool returnHtml) {
  Serial.println();
  Serial.println("==== 收到打印请求 ====");
  Serial.print("长度: ");
  Serial.println(text.length());
  Serial.println("内容（可能是 GBK 字节，监视器若显示乱码属正常）:");
  Serial.println(text);
  Serial.println("=====================");

  Printer.write(0x1B);  // ESC @ 初始化
  Printer.write(0x40);
  delay(50);
  Printer.write(0x1C);  // FS &  进入 GBK 中文模式
  Printer.write(0x26);

  // text 此时是 GBK 双字节中文 + ASCII 单字节混合，println 会按字节透传
  Printer.println(text);
  Printer.write('\n');
  Printer.write('\n');
  Printer.write('\n');

  if (returnHtml) {
    String html;
    html.reserve(text.length() + 512);
    html += "<!doctype html><html lang=\"zh-CN\"><head>";
    html += "<meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">";
    html += "<title>可打印</title><style>";
    html += "body{font-family:-apple-system,'PingFang SC',sans-serif;padding:24px;max-width:520px;margin:0 auto;background:#f7f7f7}";
    html += ".ok{font-size:28px;color:#0a0}h1{margin:8px 0}";
    html += ".panel{background:#fff;padding:16px;border-radius:8px;margin-top:16px;box-shadow:0 1px 3px rgba(0,0,0,.06)}";
    html += ".body{white-space:pre-wrap;font-family:monospace;font-size:14px;background:#fafafa;padding:12px;border-radius:6px;border:1px dashed #ddd}";
    html += ".meta{color:#666;font-size:13px;margin-top:8px}a{display:inline-block;margin-top:18px;color:#06f}";
    html += "</style></head><body>";
    html += "<div class=\"ok\">✅ 可打印</div>";
    html += "<h1>ESP32 已收到文本</h1>";
    html += "<div class=\"panel\"><div class=\"meta\">字节数：" + String(text.length()) + "</div>";
    html += "<div class=\"body\">" + htmlEscape(text) + "</div></div>";
    html += "<a href=\"javascript:history.back()\">← 返回浏览器上一页</a>";
    html += "</body></html>";
    server.send(200, "text/html; charset=utf-8", html);
  } else {
    String resp = "{\"ok\":true,\"bytes\":" + String(text.length()) + "}";
    server.send(200, "application/json", resp);
  }
}

// 给本地 dev HTTP 页面用：fetch('/print', {method:'POST', body:'...'})
static void handlePrintPost() {
  sendCors();
  String body = server.arg("plain");
  doPrint(body, /*returnHtml=*/false);
}

// 给 HTTPS Vercel 页面用：window.location = 'http://.../print?text=...'
// HTTPS -> HTTP 顶层跳转浏览器放行，但子资源 fetch 会被 mixed-content 拦截
static void handlePrintGet() {
  sendCors();
  if (!server.hasArg("text")) {
    server.send(400, "text/html; charset=utf-8",
                "<!doctype html><meta charset=utf-8><p>缺少 ?text= 参数</p>");
    return;
  }
  String text = server.arg("text");
  doPrint(text, /*returnHtml=*/true);
}

// ====== 主流程：位图打印 ======
// 浏览器 POST 位图给 Vercel 拿到 token，然后顶层跳转到这里。
// ESP32 自己用 HTTPS 把位图字节流拉下来，写打印机。
// 字节流格式：[widthLo, widthHi, heightLo, heightHi, ...1bpp bytes...]
//
// 性能粗算：38KB 位图 @ 9600 baud ≈ 40s，主要瓶颈在打印机串口，不是 WiFi/HTTPS。
static void handlePrintImageGet() {
  sendCors();
  if (!server.hasArg("token")) {
    server.send(400, "text/html; charset=utf-8",
                "<!doctype html><meta charset=utf-8><p>缺少 ?token= 参数</p>");
    return;
  }
  String token = server.arg("token");

  Serial.println();
  Serial.println("==== /print-image ====");
  Serial.print("token: "); Serial.println(token);

  WiFiClientSecure secureClient;
  secureClient.setInsecure();        // 跳过 Vercel 证书校验：token 不可猜，且我们不存敏感数据
  secureClient.setTimeout(15000);

  HTTPClient https;
  String url = String("https://") + VERCEL_HOST + "/api/print-bitmap?token=" + token;
  Serial.print("拉取: "); Serial.println(url);

  if (!https.begin(secureClient, url)) {
    server.send(500, "text/plain", "HTTPS begin failed");
    return;
  }
  https.setTimeout(20000);

  int httpCode = https.GET();
  if (httpCode != 200) {
    Serial.printf("HTTP code = %d\n", httpCode);
    String msg = String("Vercel 返回 ") + httpCode + "，token 可能已过期或被消费过。";
    https.end();
    server.send(httpCode > 0 ? httpCode : 502, "text/html; charset=utf-8",
                String("<!doctype html><meta charset=utf-8><p>") + msg + "</p>");
    return;
  }

  WiFiClient* stream = https.getStreamPtr();
  int totalLen = https.getSize();
  Serial.printf("Content-Length: %d\n", totalLen);

  if (totalLen < 5) {
    https.end();
    server.send(502, "text/plain", "Body too small");
    return;
  }

  // 1) 读 4 字节 W/H 头
  uint8_t header[4];
  size_t headerRead = readExact(*stream, header, 4, 10000);
  if (headerRead != 4) {
    https.end();
    server.send(502, "text/plain", "Failed to read W/H header");
    return;
  }
  uint16_t widthDots  = header[0] | (header[1] << 8);
  uint16_t heightDots = header[2] | (header[3] << 8);
  uint16_t bytesPerRow = widthDots / 8;
  uint32_t expectedBitmap = (uint32_t)bytesPerRow * heightDots;
  Serial.printf("位图: %u x %u, bpr=%u, expected=%lu 字节\n",
                widthDots, heightDots, bytesPerRow,
                (unsigned long)expectedBitmap);

  if (widthDots != 384) {
    https.end();
    server.send(400, "text/plain", "v1 仅支持 widthDots=384");
    return;
  }

  // 2) 初始化打印机
  Printer.write(0x1B); Printer.write(0x40);   // ESC @
  delay(50);

  // 3) 切 256 行一片发 GS v 0
  uint8_t rowBuf[48];                    // 48 字节 / 行（固定 384/8）
  uint32_t rowsLeft = heightDots;
  uint32_t printedBytes = 0;
  unsigned long t0 = millis();

  while (rowsLeft > 0) {
    uint16_t chunkRows = rowsLeft > 256 ? 256 : (uint16_t)rowsLeft;

    Printer.write(0x1D); Printer.write(0x76);    // GS v
    Printer.write(0x30); Printer.write(0x00);    // 0, mode=0
    Printer.write(bytesPerRow & 0xFF);
    Printer.write((bytesPerRow >> 8) & 0xFF);
    Printer.write(chunkRows & 0xFF);
    Printer.write((chunkRows >> 8) & 0xFF);

    for (uint16_t r = 0; r < chunkRows; r++) {
      size_t got = readExact(*stream, rowBuf, bytesPerRow, 8000);
      if (got != bytesPerRow) {
        Serial.printf("流读取中断：得到 %u 字节，期望 %u\n", (unsigned)got, bytesPerRow);
        https.end();
        server.send(502, "text/plain", "Stream truncated mid-bitmap");
        return;
      }
      Printer.write(rowBuf, bytesPerRow);
      printedBytes += bytesPerRow;
    }
    rowsLeft -= chunkRows;
    Serial.printf("已写 %lu / %lu 字节\n",
                  (unsigned long)printedBytes, (unsigned long)expectedBitmap);
  }

  // 4) 走纸
  Printer.write('\n'); Printer.write('\n'); Printer.write('\n');
  https.end();

  unsigned long ms = millis() - t0;
  Serial.printf("打印完成，UART 耗时 %lu ms\n", ms);

  // 5) 返回 HTML 确认页
  String html;
  html.reserve(768);
  html += "<!doctype html><html lang=\"zh-CN\"><head>";
  html += "<meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">";
  html += "<title>已打印</title><style>";
  html += "body{font-family:-apple-system,'PingFang SC',sans-serif;padding:24px;max-width:520px;margin:0 auto;background:#f7f7f7}";
  html += ".ok{font-size:32px;color:#0a0}h1{margin:8px 0}";
  html += ".panel{background:#fff;padding:14px;border-radius:8px;margin-top:14px;box-shadow:0 1px 3px rgba(0,0,0,.06)}";
  html += ".meta{color:#555;font-size:14px;line-height:1.7}a{display:inline-block;margin-top:16px;color:#06f}";
  html += "</style></head><body>";
  html += "<div class=\"ok\">✅ 已打印</div>";
  html += "<h1>位图已写入打印机</h1>";
  html += "<div class=\"panel\"><div class=\"meta\">";
  html += "宽度：" + String(widthDots) + " dots<br>";
  html += "高度：" + String(heightDots) + " dots<br>";
  html += "位图字节：" + String((unsigned long)expectedBitmap) + "<br>";
  html += "UART 耗时：" + String(ms) + " ms";
  html += "</div></div>";
  html += "<a href=\"javascript:history.back()\">← 返回</a>";
  html += "</body></html>";
  server.send(200, "text/html; charset=utf-8", html);
}

// 从 stream 读 exact 字节数，带超时（避免读到一半 hang 死）
static size_t readExact(WiFiClient& stream, uint8_t* dst, size_t want, unsigned long timeoutMs) {
  size_t got = 0;
  unsigned long deadline = millis() + timeoutMs;
  while (got < want) {
    if (millis() > deadline) return got;
    int avail = stream.available();
    if (avail <= 0) {
      if (!stream.connected() && stream.available() <= 0) return got;
      delay(1);
      continue;
    }
    int n = stream.readBytes(dst + got, want - got);
    if (n <= 0) {
      delay(1);
      continue;
    }
    got += n;
  }
  return got;
}

void setup() {
  Serial.begin(115200);
  Printer.begin(9600, SERIAL_8N1, 1, 2);  // RX=1, TX=2
  delay(500);

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  Serial.print("正在连接热点");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.println("已连接！");
  Serial.print("ESP32 IP: ");
  Serial.println(WiFi.localIP());

  server.on("/",                HTTP_GET,     handleRoot);
  server.on("/ping",            HTTP_GET,     handlePing);
  server.on("/print-image",     HTTP_GET,     handlePrintImageGet);
  server.on("/print",           HTTP_GET,     handlePrintGet);
  server.on("/print",           HTTP_POST,    handlePrintPost);
  server.on("/print",           HTTP_OPTIONS, handleOptions);
  server.on("/print-gbk-test",  HTTP_GET,     handleGbkTest);
  server.onNotFound([]() {
    sendCors();
    server.send(404, "text/plain", "Not found");
  });
  server.begin();
  Serial.println("HTTP server 已启动 (端口 80)");
  Serial.println("浏览器访问: http://" + WiFi.localIP().toString() + "/");
}

void loop() {
  server.handleClient();
}
