# 小票位图打印（WiFi 路径）设计文档

**日期**：2026-05-29
**方案**：A — 表单 POST 顶层跳转 + ESP32 流式 base64 解码

## 背景与目标

当前 [https://snap-roast-buddy-delta.vercel.app/](https://snap-roast-buddy-delta.vercel.app/) 的打印按钮通过 WiFi 路径（[frontend/src/product.ts:823-950](../../../frontend/src/product.ts#L823)）走 `GET http://<esp32-ip>/print?text=...` 顶层跳转，ESP32 端 `Printer.println(text)` 透传文本，只能打印打印机内置字库支持的字符。

这条路无法打印：
- 整张小票的视觉效果（漫画插画、装饰元素、版式）
- 大字（打印机字库无缩放命令）
- 任何非字库字符

目标：把当前 WiFi 文本透传路径**替换**为整张小票截图位图打印，与现有 BLE 路径行为一致。

## 关键约束

1. **mixed content**：页面在 HTTPS（Vercel），ESP32 在 HTTP；浏览器允许顶层 navigation 和表单 POST（带警告），但拦截 `fetch POST` 跨 mixed content
2. **网络拓扑**：ESP32 在用户手机热点的内网里，Vercel 后端公网访问不到，无法做服务端中转
3. **现有资源**：
   - 前端已有完整的位图字节生成实现 [frontend/src/lib/printer.ts:102](../../../frontend/src/lib/printer.ts#L102) `canvasToEscPosRaster()`，输出 ESC/POS `GS v 0` 命令字节流，但只接到了 BLE 通道
   - ESP32 是 ESP32-S3 N16R8（16MB Flash + 8MB PSRAM），内存极宽裕

## 架构

```
[HTTPS 商品页面]
    │
    │ 1. 用户点打印按钮
    ▼
[前端 product.ts]
    │ 2. 截图 receipt DOM 元素 → canvas
    │ 3. canvasToEscPosRaster() → Uint8Array (ESC/POS 字节流)
    │ 4. 分块 base64 编码（避免 btoa 栈溢出）
    │ 5. 动态建 <form action="http://<ip>/print-raster" method=POST>
    │    hidden input name=data value=<base64>
    │ 6. form.submit() 触发顶层跳转
    ▼
[浏览器]
    │ 7. 弹一次 "提交不安全表单" 警告 → 用户确认
    ▼
[ESP32 POST /print-raster]
    │ 8. server.arg("data") 读 base64 字符串
    │ 9. 流式 base64 解码：每解 4 字符 → 3 字节 → 立刻 Printer.write()
    │10. 解码完成 → 走纸 → 返回 "已打印" HTML 页（带返回链接）
    ▼
[热敏打印机出纸]
```

## 组件

### 前端 — `frontend/src/product.ts`

替换 [frontend/src/product.ts:823-950](../../../frontend/src/product.ts#L823) 整段 "ESP32 WiFi 打印" 逻辑：

**改动**：
- 把当前的 `printToEsp32(text)` 重写为 `printRasterToEsp32(element: HTMLElement)`
- 函数内部：
  1. 接受小票预览 DOM 元素
  2. 截图为 canvas（复用 `printer.ts` 里的 `elementToCanvas()` 逻辑，需要 export 出来）
  3. 调 `canvasToEscPosRaster(canvas)` 拿到 `Uint8Array`
  4. 分块 base64 编码：每 8KB 一段调 `btoa(String.fromCharCode(...chunk))` 然后拼接，避免一次性 spread 大数组栈溢出
  5. 拿到/校验 ESP32 IP（沿用现有 `getStoredEsp32Ip` / `askForEsp32Ip` 流程）
  6. 动态构造 form：
     ```ts
     const form = document.createElement('form');
     form.method = 'POST';
     form.action = `http://${ip}/print-raster`;
     form.enctype = 'application/x-www-form-urlencoded';
     const input = document.createElement('input');
     input.type = 'hidden';
     input.name = 'data';
     input.value = base64;
     form.appendChild(input);
     document.body.appendChild(form);
     form.submit();
     ```
- 打印按钮的事件处理器（按一下打印 / 长按重设 IP）保留，只换里面调用的函数

**删除**：product.ts 里当前 WiFi 文本透传分支的 UTF-8 → GBK 编码相关代码（调用 `cptable.utils.encode(936, text)` 的部分）。`frontend/vendor/cputils.js` 文件本身保留（print-test.html 仍需要）；`frontend/index.html:11` 的 `<script src="./vendor/cputils.js">` 标签删除，主页面位图路径不再依赖 GBK 编码。

### 前端 — `frontend/src/lib/printer.ts`

**改动**：把 `elementToCanvas()` 从内部函数改为 `export`，让 product.ts 能复用。其它不动（BLE 路径继续工作）。

### ESP32 — `hardware/esp32/snap_roast_print/snap_roast_print.ino`

**新增**：`handlePrintRaster()` 处理 `POST /print-raster`：

1. `sendCors()`
2. 检查 `server.hasArg("data")`，无则返回 400
3. 拿 `server.arg("data")` 的 String 引用（base64）
4. 流式 base64 解码循环：
   - 维护 base64 解码状态机（4 字符 → 3 字节）
   - 跳过 `=` padding 和非 base64 字符
   - 每解出 1 字节立刻 `Printer.write(byte)`
   - 不在 RAM 累积解码后的字节流
5. 解码完成后 `Printer.write('\n'); Printer.write('\n'); Printer.write('\n');` 走纸
6. 返回 200 + "已打印" HTML 页（结构沿用 `doPrint(returnHtml=true)` 那段）

**新增**：`server.on("/print-raster", HTTP_POST, handlePrintRaster);` 注册

**保留**：现有 `GET /print?text=`、`POST /print`、`GET /`、`GET /ping`、OPTIONS 处理全部不变（继续给 print-test.html 用）

### `frontend/index.html`

按钮 [frontend/index.html:103](../../../frontend/index.html#L103) 的 `aria-label` / `title` 保留语义（"发到 ESP32 打印"），实现从文本切换到位图

## 数据流细节

### base64 编码（前端）
- 输入：`Uint8Array`，典型 ~38KB（384 宽 × 800 高 / 8 + 8 字节 GS v 0 header）
- 分块：每 8192 字节一段
- 每段：`btoa(String.fromCharCode.apply(null, Array.from(chunk)))`
- 输出拼接：~51KB base64 字符串

### URL encode（浏览器自动）
- 浏览器在提交 `application/x-www-form-urlencoded` 表单时会对 base64 中的 `+` `/` `=` 编码
- 实际 body 略大于 base64 长度，但远小于原始字节 3 倍膨胀
- ESP32 端 `server.arg("data")` 拿到的已经是浏览器 URL decode 后的原 base64 字符串

### base64 解码（ESP32）
- 标准字母表 `A-Za-z0-9+/`，padding `=`
- 状态机：累计 6-bit 单元，每收满 24 bit → 输出 3 字节到 `Printer.write`
- padding 处理：1 个 `=` = 输出 2 字节，2 个 `=` = 输出 1 字节
- 非字母表字符（换行、空格）跳过，容错

## 不在范围

- BLE 路径修改（已能位图打印）
- 打印机状态回报、无纸检测
- 多张图分页 / 切纸控制
- 打印进度条
- 前端分块上传（N16R8 内存够，单次足够）
- print-test.html 调整（文本调试通道保留）

## 测试方案

### 手动端到端
1. 商品识别 → 生成小票预览
2. 点打印按钮
3. 浏览器弹"提交不安全表单"警告 → 确认
4. 跳转到 ESP32 IP 的"已打印"页
5. 打印机出纸：与屏幕预览视觉一致（漫画、大字、文案、版式都在）
6. 点"返回上一页" → 回到商品页

### 边界
- 极短小票（高度 < 100px）：不应卡在分块或解码状态机
- 极长小票（高度 > 1000px，base64 ~70KB+）：ESP32 收得下、Printer 出得完
- 中英文 + 漫画插画 + 大字混合的复杂版式

### ESP32 诊断
- Serial 监视器输出：收到 `data` 字段长度、解码出字节数、是否完整 write 给 Printer
- 现有 `Serial.println` 风格保留

## 风险与回滚

| 风险 | 影响 | 缓解 |
|---|---|---|
| 浏览器警告体验差 | 用户每次打印多一次确认 | 已知接受，方案 A 的固有代价 |
| base64 编码栈溢出 | 大票据前端卡死 | 分块 8KB 编码 |
| ESP32 流式解码卡 Printer 串口 buffer | 打印机吞吐 < 解码速度 | 9600 bps 串口本身就慢，Printer.write 阻塞写自然限速 |
| 大票据 form body 超浏览器/ESP32 限制 | 提交失败 | N16R8 内存够，浏览器对 form body 无明确硬上限；如真遇到再做分块 |

回滚：保留旧端点 `POST /print` 和 `GET /print?text=`，前端代码改回调旧端点即可。git revert 单个 commit 即可恢复。
