# Supabase Storage：`print-bitmaps` bucket 设置

ESP32 WiFi 打印链路在 Vercel 端用 Supabase Storage 做位图中转。需要在 Supabase 项目里新建一个 private bucket。

## 一次性配置（控制台操作）

1. 打开 Supabase Dashboard → 项目 → 左侧 **Storage**
2. 点击 **New bucket**
3. 填写：
   - **Name**：`print-bitmaps`
   - **Public bucket**：**关闭**（必须 private，否则任何人可枚举位图）
   - **File size limit**：可选填 `300 KB`（位图本身不超过 200KB，留一点余量）
   - **Allowed MIME types**：留空（允许任何，因为是 `application/octet-stream`）
4. 创建

## 不需要 RLS policies

Vercel 后端用 `SUPABASE_SERVICE_ROLE_KEY` 访问 Storage，service role 绕过 RLS。普通用户不会直接接触这个 bucket，所以不用配 policy。

## 环境变量

默认 bucket 名是 `print-bitmaps`，如果想换名字，在 Vercel Environment Variables 加：

```env
SUPABASE_PRINT_BITMAPS_BUCKET=your-bucket-name
```

## 清理策略

ESP32 拉取成功后会自动 DELETE 文件，所以"被打印完的"位图不会堆积。但有两种情况会留垃圾：

- 用户上传了 token 但 ESP32 那边一直没拉（页面切走 / 网络断了 / IP 错了）
- 上传成功但 token TTL（默认 5 分钟）已过

建议在 Supabase 控制台为该 bucket 配 lifecycle 规则（**Storage → Settings → Lifecycle**）：

> 删除 24 小时前创建的所有对象

或定期手动清空。位图体量小，即使一天积累上百张也只是几 MB。

## 验证 bucket 配好

部署 Vercel 之后，本地一行 curl：

```bash
curl -X POST https://snap-roast-buddy-delta.vercel.app/api/print-bitmap \
  -H "Content-Type: application/octet-stream" \
  --data-binary "$(printf '\x80\x01\x10\x00' && head -c 1920 /dev/urandom)"
```

`\x80\x01` = 宽度 384（小端，0x0180=384），`\x10\x00` = 高度 16（0x0010=16），后面 1920 字节 = 48 字节/行 × 16 行。

应该返回：

```json
{"token":"xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx","expiresInSeconds":300,"widthDots":384,"heightDots":16,"bytes":1920}
```

拿到 token 再 GET 一次：

```bash
curl -i "https://snap-roast-buddy-delta.vercel.app/api/print-bitmap?token=<token>"
```

应该 200 返回 1924 字节（4 头 + 1920 位图）。再请求一次应该 410（一次性消费）。
