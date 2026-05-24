import { handleDeleteProductRecord } from "../_shared.mjs";

export default function handler(req, res) {
  if (req.method === "DELETE") return handleDeleteProductRecord(req, res);

  res.statusCode = 405;
  res.end("Method Not Allowed");
}
