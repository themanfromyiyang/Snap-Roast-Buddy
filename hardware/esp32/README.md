# ESP32 Integration Placeholder

后续硬件接入建议放在这里。

推荐链路：

```txt
frontend
  -> backend /api/roast
  -> packages/layout 生成 LayoutDocument
  -> backend /api/print
  -> ESC/POS bitmap
  -> ESP32
  -> 58mm thermal printer
```

可选通信方式：

- HTTP：ESP32 作为局域网设备，后端主动推送打印任务。
- WebSocket：ESP32 长连接后端，后端下发队列任务。
- BLE：手机端或桌面端直接连接 ESP32。
- Serial：开发阶段最简单，后端通过串口写入打印数据。

第一版建议先实现：

```txt
POST /api/print
body: {
  layoutJson: LayoutDocument
}
```

后端先把小票渲染为黑白 bitmap，再转 ESC/POS 数据。
