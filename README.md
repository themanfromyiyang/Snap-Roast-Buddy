# Snap Roast Buddy

Snap Roast Buddy（拍立怼）是一个移动端相机式 AI 小票应用。用户拍照或导入照片后，系统会分析画面、生成带吐槽感的文案，并把结果排版成 58mm 热敏纸风格的小票；也支持爆字、像素表情、黑白漫画贴纸和实体打印。

项目目标不是单纯生成一句 AI 文案，而是把一次拍照变成一张可以收藏、分享、围观，甚至真正打印出来的“小票事件”。

当前默认入口是产品模式。访问 `/` 会直接进入 `frontend/index.html`。


https://github.com/user-attachments/assets/95ecd5b5-c50e-44bf-aad5-6770d7ddbce6



## 当前能力

### 移动端产品模式

- 手机摄像头实时取景，支持前后摄像头切换。
- 取景框保持竖屏 `3:4`，支持点击对焦反馈。
- 支持 `1x` 到 `3x` 取景倍率切换。
- 支持从设置页导入相册照片。
- 支持自动、小票、爆字、表情等生成模式。
- 支持漫画贴纸开关，可生成黑白漫画并嵌入小票。
- 生成后进入结果相册，照片和小票可同步横向浏览。
- 支持重新生成、删除确认、原图预览和相册记录。
- 相册记录优先保存到 Supabase；浏览器 IndexedDB/localStorage 作为本地兜底缓存。

### AI 生成链路

- `/api/analyze-image`：分析照片内容，输出可供吐槽生成使用的画面描述。
- `/api/classify-layout`：自动判断适合小票、爆字还是表情类版式。
- `/api/roast`：生成中文吐槽文案和增强描述。
- `/api/generate-doodle`：可选生成适合热敏纸展示的黑白漫画贴纸。
- `packages/layout`：封装版式选择、文案结构、SVG/HTML 预览等可复用逻辑。

### 硬件与打印

- 支持把小票 DOM 渲染成 canvas，再转换为 ESC/POS 位图数据。
- 支持通过 ESP32 WiFi 路径提交整张小票位图到热敏打印机。
- ESP32 固件支持 `/print-raster`，可流式解码 base64 并直接写入打印机。
- ESP32 支持首次开机 AP 配网，手机连接 `SnapRoast-Setup` 后可在配网页选择 WiFi。
- ESP32 硬件按钮可通过 MQTT 中转触发网页快门，适合做实体拍照装置。

### 测试与调试

- `frontend/index.html`：移动端产品模式。
- `frontend/test.html`：工程测试页，可手动输入描述或上传图片测试生成链路。
- `frontend/debug.html`：Prompt、layout skills、SVG 预览调试面板。
- `frontend/print-test.html`：热敏打印相关测试页。
- `frontend/poster.html`：项目展板海报，可点击占位框临时上传主视觉、界面截图、小票样张和硬件现场图片，并支持浏览器打印 / 导出 PDF。

## 生成流程

```txt
1. 获取照片
   - 产品模式：手机摄像头拍摄或从设置页导入
   - 测试页：上传图片或编辑图片描述

2. 图片分析
   - POST /api/analyze-image
   - 默认视觉模型：Pro/moonshotai/Kimi-K2.6

3. 排版选择
   - POST /api/classify-layout
   - 自动选择 receipt / big_text / pixel_expression

4. 文案生成
   - POST /api/roast
   - 默认文本模型：Pro/zai-org/GLM-4.7

5. 可选漫画
   - POST /api/generate-doodle
   - 默认图像编辑模型：Qwen/Qwen-Image-Edit-2509

6. 记录保存
   - Vercel：POST /api/product-records -> Supabase
   - 本地开发：backend/server.mjs 写入 local-data/snap-roast-records.json
   - 浏览器：IndexedDB/localStorage 兜底缓存

7. 可选打印
   - 小票 DOM -> canvas -> ESC/POS raster -> base64
   - POST 到 ESP32 `/print-raster`
   - ESP32 解码并发送到 58mm 热敏打印机
```

## 项目结构

```txt
frontend/
  index.html              # 移动端产品模式，默认入口
  test.html               # 工程测试页
  debug.html              # 调试面板
  print-test.html         # 打印测试页
  poster.html             # 项目展板海报
  poster.css
  poster.js
  styles.css
  src/app.ts              # 测试页交互
  src/product.ts          # 产品模式交互
  src/debug.ts            # 调试页交互
  src/lib/printer.ts      # 小票截图、ESC/POS 位图、BLE/WiFi 打印工具
  dist/                   # 构建产物

api/
  _shared.mjs             # Vercel API 共享逻辑
  analyze-image.mjs
  classify-layout.mjs
  roast.mjs
  generate-doodle.mjs
  product-records.mjs
  product-records/[id].mjs
  supabase-health.mjs

backend/
  server.mjs              # 本地开发静态服务 + API 代理

packages/layout/
  src/                    # 小票布局、渲染和技能规则执行

config/layout-skills/
  *.md / *.json           # 可调整的排版规则

hardware/esp32/
  snap_roast_print/       # ESP32 热敏打印与硬件按钮固件

docs/
  architecture.md
  supabase-product-records.sql
  superpowers/            # 设计文档与实现计划

local-data/               # 本地生成记录，已 gitignore
local-photos/             # 本地测试照片，已 gitignore
```

## 本地启动

```bash
npm install
npm run build:frontend
npm run dev
```

打开：

```txt
http://localhost:5173
```

常用页面：

```txt
http://localhost:5173/index.html
http://localhost:5173/test.html
http://localhost:5173/debug.html
http://localhost:5173/print-test.html
http://localhost:5173/poster.html
```

## 环境变量

复制 `.env.example` 为 `.env`，填入服务端密钥：

```env
SILICONFLOW_API_KEY=YOUR_API_KEY
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
SILICONFLOW_MODEL=Pro/zai-org/GLM-4.7
SILICONFLOW_VISION_MODEL=Pro/moonshotai/Kimi-K2.6
SILICONFLOW_IMAGE_EDIT_MODEL=Qwen/Qwen-Image-Edit-2509

SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SECRET_KEY
SUPABASE_PRODUCT_RECORDS_TABLE=product_records
```

`SUPABASE_SERVICE_ROLE_KEY` 是高权限 Secret key，只能放在服务端环境变量里。不要写进前端代码，不要提交到 Git。

## Supabase 数据库

在 Supabase SQL Editor 里执行建表 SQL：

```sql
create table if not exists public.product_records (
  id text primary key,
  original_image_url text not null,
  created_at timestamptz not null,
  description text,
  layout_type text not null,
  generation_mode text not null,
  roast_level text not null,
  sketch_mode text not null,
  ticket_html text,
  ticket_text text,
  sketch_image_url text,
  caption text,
  record jsonb not null,
  inserted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_records_created_at_idx
  on public.product_records (created_at desc);

create or replace function public.set_product_records_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists product_records_set_updated_at on public.product_records;

create trigger product_records_set_updated_at
before update on public.product_records
for each row
execute function public.set_product_records_updated_at();

alter table public.product_records enable row level security;

drop policy if exists "product_records_no_public_access" on public.product_records;

create policy "product_records_no_public_access"
on public.product_records
for all
to anon, authenticated
using (false)
with check (false);
```

同一份 SQL 也保存在 `docs/supabase-product-records.sql`。

本地测试 Supabase：

1. 在 `.env` 填好 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` 和 `SUPABASE_PRODUCT_RECORDS_TABLE`。
2. 在 Supabase SQL Editor 执行建表 SQL。
3. 运行 `npm run dev`。
4. 打开 `http://localhost:5173/test.html`。
5. 点击页面顶部的“测试 Supabase 连接”。

也可以直接访问：

```txt
http://localhost:5173/api/supabase-health
```

成功时会返回类似：

```json
{
  "ok": true,
  "table": "product_records",
  "sampleCount": 0
}
```

## 数据格式

`product_records` 会把常用字段拆成列，方便排序和后续查询；完整记录同时存在 `record jsonb`，避免前端字段变化时频繁迁移。

```ts
type PhotoRecord = {
  id: string;
  originalImageUrl: string;
  createdAt: string;
  description?: string;
  layoutType: "receipt" | "big_text" | "expression" | "sketch";
  generationMode: "auto" | "receipt" | "big_text" | "expression";
  roastLevel: "gentle" | "normal" | "spicy" | "public_execution";
  sketchMode: "none" | "top" | "bottom" | "standalone";
  ticketHtml?: string;
  ticketText?: string;
  sketchImageUrl?: string;
  caption?: string;
};
```

## ESP32 使用提示

固件位置：

```txt
hardware/esp32/snap_roast_print/snap_roast_print.ino
```

首次烧录或换 WiFi 时：

1. 给 ESP32 通电并等待约 15 秒。
2. 如果设备没有可用 WiFi，会自动开启 `SnapRoast-Setup` 热点。
3. 手机连接该热点，系统通常会自动弹出配网页。
4. 如果没有弹出，浏览器访问 `http://192.168.4.1`。
5. 选择附近 WiFi，输入密码，保存后设备会重启并进入正常工作模式。

长按硬件按钮 5 秒会清除已保存的 WiFi 配置，并重新进入配网流程。AP 配网模式下打印和 MQTT 快门按钮不会工作。

打印时产品页会把当前小票转换为位图，并提交到 ESP32 的 `/print-raster` 端点。长按网页上的打印按钮约 1 秒可重设 ESP32 IP。

## Vercel 部署

项目已经包含 `vercel.json`：

```txt
Build Command: npm run build:frontend
Output Directory: frontend
Install Command: npm install
```

Vercel Environment Variables 需要配置：

```env
SILICONFLOW_API_KEY=YOUR_API_KEY
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
SILICONFLOW_MODEL=Pro/zai-org/GLM-4.7
SILICONFLOW_VISION_MODEL=Pro/moonshotai/Kimi-K2.6
SILICONFLOW_IMAGE_EDIT_MODEL=Qwen/Qwen-Image-Edit-2509
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SECRET_KEY
SUPABASE_PRODUCT_RECORDS_TABLE=product_records
```

Vercel 根路径 `/` 直接使用 `frontend/index.html`。

## API

```txt
POST   /api/analyze-image
POST   /api/classify-layout
POST   /api/roast
POST   /api/generate-doodle
GET    /api/product-records
POST   /api/product-records
DELETE /api/product-records/:id
GET    /api/debug/prompts
GET    /api/debug/skills
GET    /api/supabase-health
```

## 常用命令

```bash
npm run check
npm run build:frontend
npm run dev
npm run demo
```

## Git 忽略策略

已忽略：

```txt
.env
.env.local
.env.development
.env.production
.env.preview
.env.*.local
.vercel/
node_modules/
frontend/dist/
local-data/
local-photos/
```

不要提交真实 API key、Supabase service role key、本地照片或本地生成记录。

## 后续方向

- 把打印状态回传到产品页，减少用户对 ESP32 端页面的感知成本。
- 为小票记录增加筛选、搜索和分享导出能力。
- 丰富 layout skill，让不同照片类型拥有更稳定的版式策略。
- 为硬件按钮扩展长按、双击等实体交互。
