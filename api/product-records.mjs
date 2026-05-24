import { handleListProductRecords, handleSaveProductRecord } from "./_shared.mjs";

export default function handler(req, res) {
  if (req.method === "GET") return handleListProductRecords(req, res);
  if (req.method === "POST") return handleSaveProductRecord(req, res);

  res.statusCode = 405;
  res.end("Method Not Allowed");
}
