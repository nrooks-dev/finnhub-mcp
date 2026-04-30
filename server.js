import express from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

if (!FINNHUB_API_KEY) {
  throw new Error("Missing FINNHUB_API_KEY");
}

const app = express();
app.use(express.json());

async function finnhub(path, params = {}) {
  const url = new URL(`https://finnhub.io/api/v1${path}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  const res = await fetch(url, {
    headers: {
      "X-Finnhub-Token": FINNHUB_API_KEY,
    },
  });

  if (!res.ok) {
    throw new Error(`Finnhub error ${res.status}: ${await res.text()}`);
  }

  return res.json();
}

const server = new McpServer({
  name: "finnhub-mcp",
  version: "1.0.0",
});

server.tool(
  "get_quote",
  "Get the latest quote for a stock symbol.",
  {
    symbol: z.string().describe("Stock ticker, e.g. AAPL, MSFT, ASML.AS"),
  },
  async ({ symbol }) => {
    const data = await finnhub("/quote", { symbol });
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.tool(
  "search_symbol",
  "Search for stock symbols.",
  {
    q: z.string().describe("Search query, e.g. Apple or ASML"),
  },
  async ({ q }) => {
    const data = await finnhub("/search", { q });
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.tool(
  "get_company_profile",
  "Get company profile information.",
  {
    symbol: z.string().describe("Stock ticker, e.g. AAPL"),
  },
  async ({ symbol }) => {
    const data = await finnhub("/stock/profile2", { symbol });
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.tool(
  "get_company_metrics",
  "Get company financial metrics.",
  {
    symbol: z.string(),
    metric: z.string().default("all"),
  },
  async ({ symbol, metric }) => {
    const data = await finnhub("/stock/metric", { symbol, metric });
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.tool(
  "get_company_news",
  "Get company news for a date range.",
  {
    symbol: z.string(),
    from: z.string().describe("YYYY-MM-DD"),
    to: z.string().describe("YYYY-MM-DD"),
  },
  async ({ symbol, from, to }) => {
    const data = await finnhub("/company-news", { symbol, from, to });
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

server.tool(
  "get_dividends",
  "Get dividend history for a stock.",
  {
    symbol: z.string(),
    from: z.string().describe("YYYY-MM-DD"),
    to: z.string().describe("YYYY-MM-DD"),
  },
  async ({ symbol, from, to }) => {
    const data = await finnhub("/stock/dividend", { symbol, from, to });
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);

app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on("close", () => {
    transport.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get("/", (req, res) => {
  res.send("Finnhub MCP server is running");
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Finnhub MCP server listening on port ${port}`);
});