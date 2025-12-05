import { createServer, IncomingMessage, ServerResponse } from "http";
import { URL } from "url";
import { searchTools, fetchAllResources, fetchPricing, listFacilitators } from "./client.js";

const PORT = parseInt(process.env.PORT || "3402");

// Simple JSON response helper
function json(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

// Parse URL and query params
function parseRequest(req: IncomingMessage): { path: string; query: URLSearchParams } {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  return { path: url.pathname, query: url.searchParams };
}

// Request handler
async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  const { path, query } = parseRequest(req);

  try {
    // GET /search?q=<query>
    if (path === "/search" && req.method === "GET") {
      const q = query.get("q");
      if (!q) {
        return json(res, { error: "Missing query parameter 'q'" }, 400);
      }

      const tools = await searchTools(q);
      const limit = parseInt(query.get("limit") || "50");

      return json(res, {
        query: q,
        count: tools.length,
        tools: tools.slice(0, limit),
      });
    }

    // GET /tools
    if (path === "/tools" && req.method === "GET") {
      const { tools, status } = await fetchAllResources();

      const network = query.get("network");
      const limit = parseInt(query.get("limit") || "100");
      const offset = parseInt(query.get("offset") || "0");

      let filtered = tools;
      if (network) {
        filtered = tools.filter((t) =>
          t.network.toLowerCase().includes(network.toLowerCase())
        );
      }

      const paginated = filtered.slice(offset, offset + limit);

      return json(res, {
        count: filtered.length,
        limit,
        offset,
        tools: paginated,
        facilitators: status,
      });
    }

    // GET /price?url=<url>
    if (path === "/price" && req.method === "GET") {
      const url = query.get("url");
      if (!url) {
        return json(res, { error: "Missing query parameter 'url'" }, 400);
      }

      const pricing = await fetchPricing(url);
      if (!pricing) {
        return json(res, {
          url,
          error: "Could not fetch pricing. Endpoint may be down or not x402-enabled.",
        }, 404);
      }

      return json(res, { url, accepts: pricing });
    }

    // GET /facilitators
    if (path === "/facilitators" && req.method === "GET") {
      return json(res, { facilitators: listFacilitators() });
    }

    // GET /health
    if (path === "/health" && req.method === "GET") {
      return json(res, { status: "ok", timestamp: Date.now() });
    }

    // GET / - API docs
    if (path === "/" && req.method === "GET") {
      return json(res, {
        name: "x402-discover",
        version: "0.1.0",
        description: "Discovery API for x402 tools",
        endpoints: {
          "GET /search?q=<query>": "Search tools by keyword",
          "GET /tools": "List all tools (supports ?network=, ?limit=, ?offset=)",
          "GET /price?url=<url>": "Get pricing for a specific endpoint",
          "GET /facilitators": "List known facilitators",
          "GET /health": "Health check",
        },
      });
    }

    // 404
    return json(res, { error: "Not found" }, 404);
  } catch (err) {
    console.error("Error handling request:", err);
    return json(res, { error: "Internal server error" }, 500);
  }
}

// Start server
const server = createServer(handleRequest);

server.listen(PORT, () => {
  console.log(`x402-discover API running on http://localhost:${PORT}`);
  console.log();
  console.log("Endpoints:");
  console.log(`  GET /search?q=<query>  - Search tools`);
  console.log(`  GET /tools             - List all tools`);
  console.log(`  GET /price?url=<url>   - Get pricing`);
  console.log(`  GET /facilitators      - List facilitators`);
  console.log(`  GET /health            - Health check`);
});
