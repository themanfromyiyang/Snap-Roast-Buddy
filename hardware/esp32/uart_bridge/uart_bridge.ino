// Snap Roast Buddy - 临时透明 UART 桥固件
//
// 用途：让 PC 上的 PrinterSetting 工具通过 ESP32 配置打印机参数（主要是把波特率
// 从 9600 改成 115200）。烧上去之后 ESP32 只做一件事：USB 串口 ↔ 打印机 UART
// 字节透传，不解析任何内容。
//
// 用完记得换回 snap_roast_print.ino。
//
// 使用步骤：
//   1. 用 Arduino IDE 烧录这个文件到 ESP32
//   2. 关闭 Arduino 的串口监视器（否则 COM 口被占）
//   3. 打开 PrinterSetting：
//        - 串口选 COM11（或你 ESP32 实际的 COM 号）
//        - 波特率：要和打印机当前波特率一致（首次从 115200 改回 57600 时，
//          先把本文件两个 BAUD 改成 115200 连进去）
//        - 校验：NOPARITY
//        - FlowControl：No FlowControl
//   4. 点"读取打印机参数"验证通信，把"串口波特率"改成 57600 → "设置基础参数"
//   5. 把打印机断电重启
//   6. 把本文件 USB_BAUD/PRINTER_BAUD 改回 57600，重新烧桥，PrinterSetting
//      主机侧也改 57600，再读一次验证
//   7. 用完烧回 snap_roast_print.ino（其中 Printer.begin 已经是 57600）
//
// 接线（与正式固件一致）：
//   打印机 TX → ESP32 GPIO1 (RX)
//   打印机 RX → ESP32 GPIO2 (TX)
//   打印机 VH → 独立 5-9V 电源
//   打印机 GND ↔ ESP32 GND 共地
//
// 注意：桥模式不处理 DTR 流控。配置命令只有几字节，不会撑爆缓冲，DTR 可忽略。

#include <HardwareSerial.h>

HardwareSerial Printer(1);

// 打印机目标波特率 57600（之前实测 115200 在杜邦线下会零星位翻转导致 GS v 0
// 解析出错，打印机进入"无尽吃数据"状态）。如果打印机当前还在 115200，第一次
// 用这个桥先把这两个值都改成 115200 连进去，读取/设置基础参数把波特率改成
// 57600，断电重启打印机，再把这两个值改回 57600 重新烧桥固件验证。
// 如果不小心把打印机配死在某个未知波特率，挨个试（1200/2400/4800/9600/
// 19200/38400/57600/115200）重新烧，能连上的那个就是当前波特率。
static const uint32_t USB_BAUD     = 115200;
static const uint32_t PRINTER_BAUD = 115200;

void setup() {
  Serial.begin(USB_BAUD);
  Printer.begin(PRINTER_BAUD, SERIAL_8N1, 1, 2);  // RX=1, TX=2
  pinMode(41, INPUT_PULLUP);  // DTR 引脚保留高阻，不影响 PrinterSetting 配置
}

void loop() {
  while (Serial.available()) {
    Printer.write(Serial.read());
  }
  while (Printer.available()) {
    Serial.write(Printer.read());
  }
}
