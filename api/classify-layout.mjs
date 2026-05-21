import { handleClassifyLayout } from "./_shared.mjs";

export default function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end("Method Not Allowed");
    return;
  }

  return handleClassifyLayout(req, res);
}
