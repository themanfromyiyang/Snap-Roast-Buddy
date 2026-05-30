// Snap Roast Buddy - WiFi 打印验证 sketch
//
// 在你已经跑通的 WiFi 连接 + Printer.println("Hello") 基础上扩展：
//   - 启动后连接手机热点（同你之前那段代码）
//   - 启动 HTTP 服务器，监听 80 端口
//   - GET  /print?text=...  : 给 HTTPS 页面顶层跳转用（HTTPS→HTTP 顶层跳转浏览器放行）
//   - POST /print           : body 是纯文本（给本地 HTTP 页面 fetch 用）
//   - GET  /ping            : 浏览器健康探测
//   - GET  /                : 简单状态页（IP / RSSI）
// ESP32 同时把收到的文本输出到 Serial（监视器）和打印机。
//
// 注意：打印机硬件本身有没有中文字库未知。如果中文乱码，是芯片字库问题，不是传输问题。
//      验证传输只需看 Serial 监视器里收到的是不是你发的字符串。
//
// 接线（同你之前的代码）：
//   打印机 TX → ESP32 GPIO1 (RX)
//   打印机 RX → ESP32 GPIO2 (TX)
//   打印机 VH → 独立 5-9V 电源（不要从 ESP32 取电）
//   打印机 GND ↔ ESP32 GND 共地

#include <WiFi.h>
#include <WebServer.h>
#include <HardwareSerial.h>
#include "secrets.h"   // 定义 WIFI_SSID / WIFI_PASSWORD，已 .gitignore，不会进仓库

const char* ssid     = WIFI_SSID;
const char* password = WIFI_PASSWORD;

HardwareSerial Printer(1);
WebServer server(80);

// ---- 打印机 DTR 硬件流控 ----
// MY-628 规格书 P3：DTR 是打印机输出的"数据终端就绪"信号。打印机 buffer
// 快满时拉成 BUSY，ESP32 看到就停发；buffer 空了拉成 READY，继续发。
// 极性按典型 ESC/POS 约定：LOW = READY 可发，HIGH = BUSY 别发。
// 接线：打印机 RS232/TTL 接口 pin 2 (DTR) → ESP32 GPIO 41。
const int PRINTER_DTR_PIN = 41;
const int PRINTER_DTR_BUSY_LEVEL = HIGH;
const unsigned long PRINTER_DTR_TIMEOUT_MS = 30000;

// 等 DTR 变 READY 并稳定一段时间（去抖）。
// 之前一看到 READY 就发，但 DTR 在临界点会快速 BUSY/READY 抖动，导致 ESP32
// 不停 send/stop/send/stop，打印电机跟着 start/stop/start/stop，每个切换处
// 密度抖动严重。要求 DTR 连续 READY 一段时间才认为打印机真稳定了，
// 让单段发送更连贯、电机匀速。
static const int DTR_SUSTAINED_READY_US = 1000;  // 连续 READY 1ms 才认为稳了
static const int DTR_POLL_INTERVAL_US = 50;

static inline void waitPrinterReady() {
  unsigned long start = millis();
  int readyAcc = 0;   // 已连续 READY 的微秒数
  while (readyAcc < DTR_SUSTAINED_READY_US) {
    if (digitalRead(PRINTER_DTR_PIN) == PRINTER_DTR_BUSY_LEVEL) {
      readyAcc = 0;   // BUSY 一次就清零，必须重新连续 READY
      if (millis() - start > PRINTER_DTR_TIMEOUT_MS) {
        Serial.println("[dtr] WARN: 30s 等不到 READY，可能极性反或没接好");
        return;
      }
    } else {
      readyAcc += DTR_POLL_INTERVAL_US;
    }
    delayMicroseconds(DTR_POLL_INTERVAL_US);
  }
}

// 包裹 Printer.write：每发一字节前
//   1. 限制 ESP32 内部 TX FIFO 水位（让 DTR 信号实时反映真实串口状态，不滞后）
//   2. 等打印机 DTR 稳定 READY 再发
static inline void printerWriteFlow(uint8_t b) {
  while (Printer.availableForWrite() < 64) {
    yield();   // TX FIFO 还堆着一大批没发出去，先消化再说
  }
  waitPrinterReady();
  Printer.write(b);
}

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
  html.reserve(256);
  html += "<!doctype html><meta charset=\"utf-8\"><h1>Snap Roast Print</h1>";
  html += "<p>IP: " + WiFi.localIP().toString() + "</p>";
  html += "<p>RSSI: " + String(WiFi.RSSI()) + " dBm</p>";
  html += "<p>GET  /print?text=...    （给 HTTPS 页面顶层跳转用）</p>";
  html += "<p>POST /print  body=text/plain  （给本地 HTTP 页面 fetch 用）</p>";
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
  Serial.println("内容:");
  Serial.println(text);
  Serial.println("=====================");

  Printer.write(0x1B);  // ESC @ 初始化
  Printer.write(0x40);
  delay(50);

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
// 用 printerWriteFlow 每字节走 DTR 硬件流控，打印机 buffer 满时自动停发，
// 不再需要前一版盲发的 strip-delay 节流。
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
      printerWriteFlow(byte);
      outBytes++;
    }
  }
  Printer.flush();
  return outBytes;
}

// ---- GET /print-bridge：HTTPS 页面跳到这里，URL hash 里带 base64 ----
// 这一页是 HTTP origin，可以同源 fetch POST 到 /print-raster，绕开浏览器
// 对 HTTPS→HTTP form POST 把 body 吞掉的 mixed-content 策略。
static void handlePrintBridge() {
  sendCors();
  String html;
  html.reserve(2048);
  html += "<!doctype html><html lang=\"zh-CN\"><head>";
  html += "<meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">";
  html += "<title>打印中…</title><style>";
  html += "body{font-family:-apple-system,'PingFang SC',sans-serif;padding:24px;max-width:520px;margin:0 auto;background:#f7f7f7;text-align:center}";
  html += "h1{margin:8px 0}.status{color:#666;margin-top:16px;font-size:14px}.err{color:#c00}";
  html += "a{display:inline-block;margin-top:18px;color:#06f}";
  html += "</style></head><body>";
  html += "<h1>正在传位图给打印机…</h1>";
  html += "<div id=\"status\" class=\"status\">准备中</div>";
  html += "<script>";
  html += "(async()=>{";
  html += "const s=document.getElementById('status');";
  html += "const raw=location.hash.slice(1);";
  html += "if(!raw){s.textContent='错误：URL 没有 hash 数据';s.classList.add('err');return;}";
  html += "const b64=decodeURIComponent(raw);";
  html += "const CHUNK=8192;";   // 8KB 块。ESP32 Arduino WebServer 对单次 text/plain
                                  // body 有上限（实测 ~70KB 直接被丢，剩 valueLen=0），
                                  // 分小块每块就在阈值以下。8192 是 4 的倍数，base64
                                  // 切块不会跨越解码边界。
  html += "const total=Math.ceil(b64.length/CHUNK);";
  html += "s.textContent='准备分 '+total+' 块上传 ('+b64.length+' 字符)…';";
  html += "try{";
  html += "for(let seq=0;seq<total;seq++){";
  html += "const chunk=b64.slice(seq*CHUNK,(seq+1)*CHUNK);";
  html += "const isFinal=seq===total-1?1:0;";
  html += "const url='/print-raster-chunk?seq='+seq+'&final='+isFinal;";
  html += "const bytes=new TextEncoder().encode(chunk);";
  html += "s.textContent='上传 '+(seq+1)+'/'+total+' ('+chunk.length+' 字符)…';";
  html += "const r=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain'},body:bytes});";
  html += "if(!r.ok)throw new Error('块 '+seq+' 失败 HTTP '+r.status);";
  html += "if(isFinal){const t=await r.text();document.open();document.write(t);document.close();return;}";
  html += "}";
  html += "}catch(e){s.textContent='出错: '+e.message;s.classList.add('err');}";
  html += "})();";
  html += "</script>";
  html += "<a href=\"javascript:history.back()\">← 返回</a>";
  html += "</body></html>";
  server.send(200, "text/html; charset=utf-8", html);
}

// ---- 分块累积式打印的会话状态 ----
// 之前每块来了立刻解码+Printer.write，但块之间有 HTTP roundtrip 的几十毫秒
// 空隙。9600bps 串口本身就慢，热敏打印机对 GS v 0 这种多字节栅格命令有
// "等数据超时"——中途停太久就以为命令结束，后续字节被当文本解释，
// 导致打印错位、行重叠、看着糊。
//
// 正解：每块只追加到累加器（不发打印机），final=1 那块到齐后，一次性把全部
// base64 解码 + 连续 Printer.write。9600bps 串口一气吐完，没有断流。
// base64 ~74KB，ESP32-S3 N16R8 内存够。
static String g_rasterAccum;
static int g_rasterLastSeq = -1;

// ---- POST /print-raster-chunk?seq=N&final=0|1 ----
// body：8KB 的 base64 文本块（text/plain，落 arg("plain")）
static void handleRasterChunk() {
  sendCors();

  int seq = server.arg("seq").toInt();
  bool isFinal = server.arg("final") == "1";
  const String& chunk = server.arg("plain");

  Serial.print("[chunk] seq=");
  Serial.print(seq);
  Serial.print(" len=");
  Serial.print(chunk.length());
  Serial.print(" final=");
  Serial.println(isFinal ? 1 : 0);

  if (seq == 0) {
    // 新任务：清空累加器
    g_rasterAccum = "";
    g_rasterAccum.reserve(120000);   // 上限给够，避免边追加边 realloc
    g_rasterLastSeq = -1;
    Serial.println("[chunk] 开始新任务，清空累加器");
  }

  if (seq != g_rasterLastSeq + 1) {
    Serial.print("[chunk] seq 不连续，期望 ");
    Serial.print(g_rasterLastSeq + 1);
    Serial.print(" 收到 ");
    Serial.println(seq);
    server.send(400, "text/plain", "seq out of order");
    return;
  }

  g_rasterAccum += chunk;
  g_rasterLastSeq = seq;
  Serial.print("[chunk] 累加器当前长度: ");
  Serial.println(g_rasterAccum.length());

  if (isFinal) {
    // 全部到齐，一次性解码 + 连续打印
    Serial.print("[chunk] 全部块到齐，base64 总长度 ");
    Serial.println(g_rasterAccum.length());

    // ESC @ 初始化（放在 final 时做，不在 seq=0 做——避免中途收到错块后
    // 打印机已经初始化、但数据没来，下次连进来又被初始化一次）
    printerWriteFlow(0x1B);
    printerWriteFlow(0x40);
    delay(50);

    // ESC 7 n1 n2 n3：把打印速度刻意降到比 UART 数据率更慢，
    // 让电机匀速跑而不是"打一下停一下"。算式：
    //   UART 数据率 = 9600bps / 10bit / 48字节 ≈ 20 行/秒
    //   打印率 = 1000ms / (384/8/(n1+1) × (n2+n3) × 10µs / 1000)
    //   要求打印率 < 20 行/秒，电机才不会饿停。
    // 参考 MY-628 规格书 P53。
    //   n1=01  最多加热 16 点/周期（默认 80 点），降低峰值电流，
    //          每行需 24 个加热周期，整行变慢——这是把电机降速的关键
    //   n2=FF  加热时间 2550µs（最大），每个像素烧透，浓度顶
    //   n3=80  加热间隔 1280µs（默认 20µs），周期间留时间让 UART 补料
    // 算下来 24 × (2550+1280)µs ≈ 92ms/行 ≈ 10.9 行/秒，
    // 比 UART 20 行/秒慢一半，缓冲始终有料，电机匀速。
    // 代价：整张图打完时间约翻倍，但视觉一致性远好于断续打印。
    printerWriteFlow(0x1B);
    printerWriteFlow(0x37);
    printerWriteFlow(0x01);
    printerWriteFlow(0xFF);
    printerWriteFlow(0x80);
    delay(10);

    size_t printedBytes = streamBase64ToPrinter(g_rasterAccum);

    // 走纸结束
    printerWriteFlow('\n');
    printerWriteFlow('\n');
    printerWriteFlow('\n');

    Serial.print("[chunk] 完成，总解码字节: ");
    Serial.println(printedBytes);

    String html;
    html.reserve(512);
    html += "<!doctype html><html lang=\"zh-CN\"><head>";
    html += "<meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">";
    html += "<title>已打印</title><style>";
    html += "body{font-family:-apple-system,'PingFang SC',sans-serif;padding:24px;max-width:520px;margin:0 auto;background:#f7f7f7}";
    html += ".ok{font-size:28px;color:#0a0}h1{margin:8px 0}";
    html += ".panel{background:#fff;padding:16px;border-radius:8px;margin-top:16px}";
    html += ".meta{color:#666;font-size:13px}a{display:inline-block;margin-top:18px;color:#06f}";
    html += "</style></head><body>";
    html += "<div class=\"ok\">✅ 已打印</div>";
    html += "<h1>位图已发到打印机</h1>";
    html += "<div class=\"panel\"><div class=\"meta\">base64 总长度：" + String(g_rasterAccum.length()) + "</div>";
    html += "<div class=\"meta\">解码字节数：" + String(printedBytes) + "</div></div>";
    html += "<a href=\"javascript:history.back()\">← 返回</a>";
    html += "</body></html>";
    server.send(200, "text/html; charset=utf-8", html);

    // 释放累加器
    g_rasterAccum = "";
    g_rasterLastSeq = -1;
  } else {
    server.send(200, "application/json", "{\"ok\":true,\"seq\":" + String(seq) + ",\"accumLen\":" + String(g_rasterAccum.length()) + "}");
  }
}

// ---- POST /print-raster（一次性整传，留给 curl 测试小数据用）----
// body 接受两种格式：
//   1) Content-Type: text/plain，body 就是 raw base64 → 从 arg("plain") 拿
//   2) Content-Type: application/x-www-form-urlencoded，body 为 data=<base64> → 从 arg("data") 拿
// 桥接页**不再用这个端点**，改走 /print-raster-chunk 分块。
static void handlePrintRaster() {
  sendCors();

  // 诊断日志：进 handler 就打，定位 body 丢失/Content-Type 不对
  Serial.println();
  Serial.println("---- /print-raster 进入 handler ----");
  Serial.print("args count: ");
  Serial.println(server.args());
  for (int i = 0; i < server.args(); i++) {
    Serial.print("  arg["); Serial.print(i); Serial.print("] name='");
    Serial.print(server.argName(i));
    Serial.print("' valueLen=");
    Serial.println(server.arg(i).length());
  }
  Serial.print("hasArg('data'): ");
  Serial.println(server.hasArg("data") ? "yes" : "no");
  Serial.print("arg('plain') length: ");
  Serial.println(server.arg("plain").length());
  Serial.print("Content-Length header: ");
  Serial.println(server.header("Content-Length"));
  Serial.print("Transfer-Encoding header: ");
  Serial.println(server.header("Transfer-Encoding"));
  Serial.print("Content-Type header: ");
  Serial.println(server.header("Content-Type"));

  // 优先 form 字段 data；空了再回退到 plain（text/plain 直传 body 的情况）
  String b64;
  if (server.hasArg("data") && server.arg("data").length() > 0) {
    b64 = server.arg("data");
    Serial.println("body 来源: arg('data')");
  } else if (server.arg("plain").length() > 0) {
    b64 = server.arg("plain");
    Serial.println("body 来源: arg('plain')");
  } else {
    server.send(400, "text/html; charset=utf-8",
                "<!doctype html><meta charset=utf-8><p>body 为空（看串口诊断）</p>");
    return;
  }

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

void setup() {
  Serial.begin(115200);
  Printer.begin(9600, SERIAL_8N1, 1, 2);  // RX=1, TX=2
  pinMode(PRINTER_DTR_PIN, INPUT_PULLUP);  // DTR 没接时默认 BUSY（不发），安全
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

  server.on("/",      HTTP_GET,     handleRoot);
  server.on("/ping",  HTTP_GET,     handlePing);
  server.on("/print", HTTP_GET,     handlePrintGet);
  server.on("/print", HTTP_POST,    handlePrintPost);
  server.on("/print", HTTP_OPTIONS, handleOptions);
  server.on("/print-raster", HTTP_POST,    handlePrintRaster);
  server.on("/print-raster", HTTP_OPTIONS, handleOptions);
  server.on("/print-raster-chunk", HTTP_POST,    handleRasterChunk);
  server.on("/print-raster-chunk", HTTP_OPTIONS, handleOptions);
  server.on("/print-bridge", HTTP_GET,     handlePrintBridge);

  // 让 server.header("Content-Length") / ("Transfer-Encoding") 在 handler 里可读
  const char* trackedHeaders[] = { "Content-Length", "Transfer-Encoding", "Content-Type" };
  server.collectHeaders(trackedHeaders, sizeof(trackedHeaders) / sizeof(trackedHeaders[0]));

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
