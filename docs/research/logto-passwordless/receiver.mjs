// Logs every request (headers and body) and keeps the last 50; GET /log returns them as JSON.
import { createServer } from "node:http";
const seen = [];
createServer((req, res) => {
  if (req.method === "GET" && req.url === "/log") {
    res.setHeader("content-type", "application/json");
    return res.end(JSON.stringify(seen, null, 2));
  }
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    const entry = { at: new Date().toISOString(), method: req.method, url: req.url, headers: req.headers, body };
    seen.push(entry);
    if (seen.length > 50) seen.shift();
    console.log(JSON.stringify(entry));
    res.statusCode = 204;
    res.end();
  });
}).listen(8080);
