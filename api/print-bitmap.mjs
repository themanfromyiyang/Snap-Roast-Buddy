import { handlePrintBitmapFetch, handlePrintBitmapUpload } from "./_shared.mjs";

// POST: 浏览器上传 1bpp 位图 (raw octet-stream，含 4 字节 W/H 头)
// GET : ESP32 凭 token 拉取位图字节流（一次性消费）
//
// 注意：上传请求必须用 Content-Type: application/octet-stream，
//      handlePrintBitmapUpload 用流读字节，不依赖 Vercel 的 body parser。
export default function handler(req, res) {
  if (req.method === "POST") return handlePrintBitmapUpload(req, res);
  if (req.method === "GET") return handlePrintBitmapFetch(req, res);
  res.statusCode = 405;
  res.end("Method Not Allowed");
}
