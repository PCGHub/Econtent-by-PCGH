// Local-only test gateway. Never deploy this gateway or its fixed test credentials.
import http from "node:http";
const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (
    origin &&
    ["http://localhost:3000", "http://127.0.0.1:3000"].includes(origin)
  ) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "apikey,authorization,content-type,x-client-info,x-supabase-api-version",
    );
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    );
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  const auth = req.url.startsWith("/auth/v1/"),
    rest = req.url.startsWith("/rest/v1/");
  if (!auth && !rest) {
    res.writeHead(404);
    res.end();
    return;
  }
  try {
    const headers = { ...req.headers };
    delete headers.host;
    const upstream = await fetch(
      "http://127.0.0.1:" +
        (auth ? "55325" : "55326") +
        req.url.slice(auth ? 8 : 8),
      {
        method: req.method,
        headers,
        body: ["GET", "HEAD"].includes(req.method) ? undefined : req,
        duplex: "half",
        redirect: "manual",
      },
    );
    upstream.headers.forEach((value, key) => {
      if (
        ![
          "content-encoding",
          "content-length",
          "transfer-encoding",
          "connection",
        ].includes(key)
      )
        res.setHeader(key, value);
    });
    res.writeHead(upstream.status);
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    res.writeHead(502);
    res.end("Local test service is unavailable");
  }
});
server.listen(55321, "127.0.0.1", () =>
  console.log("Econtent local-only Auth/Data API gateway ready"),
);
