import { handleSupabaseHealth } from "./_shared.mjs";

export default function handler(req, res) {
  if (req.method === "GET") return handleSupabaseHealth(req, res);

  res.statusCode = 405;
  res.end("Method Not Allowed");
}
