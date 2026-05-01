import express from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY;

if (!FINNHUB_API_KEY) {
  throw new Error("Missing FINNHUB_API_KEY");
}

if (!TWELVE_DATA_API_KEY) {
  throw new Error("Missing TWELVE_DATA_API_KEY");
}

const app = express();
app.use(express.json());

async function finnhub(path, params = {}) {
  const url = new URL(`https://finnhub.io/api/v1${path}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const res = await fetch(url, {
    headers: {
      "X-Finnhub-Token": FINNHUB_API_KEY,
    },
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`Finnhub error ${res.status}: ${text}`);
  }

  return JSON.parse(text);
}

async function twelveData(path, params = {}) {
  const url = new URL(`https://api.twelvedata.com${path}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  url.searchParams.set("apikey", TWELVE_DATA_API_KEY);

  const res = await fetch(url);
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`Twelve Data error ${res.status}: ${text}`);
  }

  const data = JSON.parse(text);

  if (data.status === "error") {
    throw new Error(`Twelve Data API error: ${data.message || JSON.stringify(data)}`);
  }

  return data;
}

function jsonResponse(data) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

const server = new McpServer({
  name: "financial-data-mcp",
  version: "1.1.0",
});

/**
 * Finnhub tools
 */
server.tool(
  "get_quote",
  "Get the latest quote for a stock symbol from Finnhub.",
  {
    symbol: z.string().describe("Stock ticker, e.g. AAPL, MSFT, ASML.AS"),
  },
  async ({ symbol }) => {
    const data = await finnhub("/quote", { symbol });
    return jsonResponse(data);
  }
);

server.tool(
  "search_symbol",
  "Search for stock symbols using Finnhub.",
  {
    q: z.string().describe("Search query, e.g. Apple or ASML"),
  },
  async ({ q }) => {
    const data = await finnhub("/search", { q });
    return jsonResponse(data);
  }
);

server.tool(
  "get_company_profile",
  "Get company profile information from Finnhub.",
  {
    symbol: z.string().describe("Stock ticker, e.g. AAPL"),
  },
  async ({ symbol }) => {
    const data = await finnhub("/stock/profile2", { symbol });
    return jsonResponse(data);
  }
);

server.tool(
  "get_company_metrics",
  "Get company financial metrics from Finnhub.",
  {
    symbol: z.string(),
    metric: z.string().default("all"),
  },
  async ({ symbol, metric }) => {
    const data = await finnhub("/stock/metric", { symbol, metric });
    return jsonResponse(data);
  }
);

server.tool(
  "get_company_news",
  "Get company news from Finnhub for a date range.",
  {
    symbol: z.string(),
    from: z.string().describe("YYYY-MM-DD"),
    to: z.string().describe("YYYY-MM-DD"),
  },
  async ({ symbol, from, to }) => {
    const data = await finnhub("/company-news", { symbol, from, to });
    return jsonResponse(data);
  }
);

server.tool(
  "get_dividends",
  "Get dividend history from Finnhub.",
  {
    symbol: z.string(),
    from: z.string().describe("YYYY-MM-DD"),
    to: z.string().describe("YYYY-MM-DD"),
  },
  async ({ symbol, from, to }) => {
    const data = await finnhub("/stock/dividend", { symbol, from, to });
    return jsonResponse(data);
  }
);

/**
 * Twelve Data tools
 */
server.tool(
  "td_get_price",
  "Get latest price from Twelve Data.",
  {
    symbol: z.string().describe("Symbol, e.g. AAPL, MSFT, EUR/USD, BTC/USD"),
  },
  async ({ symbol }) => {
    const data = await twelveData("/price", { symbol });
    return jsonResponse(data);
  }
);

server.tool(
  "td_get_quote",
  "Get quote data from Twelve Data.",
  {
    symbol: z.string().describe("Symbol, e.g. AAPL, MSFT, ASML"),
  },
  async ({ symbol }) => {
    const data = await twelveData("/quote", { symbol });
    return jsonResponse(data);
  }
);

server.tool(
  "td_get_time_series",
  "Get OHLCV time series from Twelve Data.",
  {
    symbol: z.string().describe("Symbol, e.g. AAPL"),
    interval: z.string().default("1day").describe("Examples: 1min, 5min, 15min, 1h, 1day, 1week, 1month"),
    outputsize: z.number().optional().describe("Number of data points"),
    start_date: z.string().optional().describe("YYYY-MM-DD or YYYY-MM-DD HH:MM:SS"),
    end_date: z.string().optional().describe("YYYY-MM-DD or YYYY-MM-DD HH:MM:SS"),
  },
  async ({ symbol, interval, outputsize, start_date, end_date }) => {
    const data = await twelveData("/time_series", {
      symbol,
      interval,
      outputsize,
      start_date,
      end_date,
    });
    return jsonResponse(data);
  }
);

server.tool(
  "td_search_symbol",
  "Search symbols using Twelve Data.",
  {
    symbol: z.string().describe("Search query, e.g. Apple, ASML, Microsoft"),
  },
  async ({ symbol }) => {
    const data = await twelveData("/symbol_search", { symbol });
    return jsonResponse(data);
  }
);

server.tool(
  "td_get_stocks",
  "Get stock universe from Twelve Data, optionally filtered by exchange or country.",
  {
    exchange: z.string().optional().describe("Exchange code/name, optional"),
    country: z.string().optional().describe("Country name, optional"),
    type: z.string().optional().describe("Instrument type, optional"),
  },
  async ({ exchange, country, type }) => {
    const data = await twelveData("/stocks", { exchange, country, type });
    return jsonResponse(data);
  }
);

server.tool(
  "td_get_etfs",
  "Get ETF universe from Twelve Data.",
  {
    exchange: z.string().optional(),
    country: z.string().optional(),
  },
  async ({ exchange, country }) => {
    const data = await twelveData("/etfs", { exchange, country });
    return jsonResponse(data);
  }
);

server.tool(
  "td_get_forex_pairs",
  "Get available forex pairs from Twelve Data.",
  {},
  async () => {
    const data = await twelveData("/forex_pairs");
    return jsonResponse(data);
  }
);

server.tool(
  "td_get_cryptocurrencies",
  "Get available cryptocurrencies from Twelve Data.",
  {},
  async () => {
    const data = await twelveData("/cryptocurrencies");
    return jsonResponse(data);
  }
);

/**
 * MCP endpoint
 */
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

/**
 * Health check
 */
app.get("/", (req, res) => {
  res.send("Financial Data MCP server is running");
});

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Financial Data MCP server listening on port ${port}`);
});