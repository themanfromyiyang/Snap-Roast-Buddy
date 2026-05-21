# Architecture

## Frontend

负责：

- 输入照片描述
- 选择生成模式和吐槽强度
- 调用 `/api/roast`
- 调用本地浏览器排版核心生成 SVG 预览

## Backend

负责：

- 托管前端页面
- 保护 API key
- 调用 SiliconFlow Chat Completions
- 后续承接打印接口、队列、ESP32 通信

## Layout Package

`packages/layout` 是可复用核心，不依赖浏览器 UI。

当前能力：

- `analyzePhotoDescription`
- `selectLayoutType`
- `generateRoastContent`
- `generateLayoutDocument`
- `renderTextPreview`
- `renderSvgPreview`

后续可以继续增加：

- `renderPng`
- `convertToEscPos`
- `sendToPrinter`
