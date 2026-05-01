import express from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY;
const FRED_API_KEY = process.env.FRED_API_KEY;

if (!FINNHUB_API_KEY) throw new Error("Missing FINNHUB_API_KEY");
if (!TWELVE_DATA_API_KEY) throw new Error("Missing TWELVE_DATA_API_KEY");
if (!FRED_API_KEY) throw new Error("Missing FRED_API_KEY");

const app = express();
app.use(express.json());

function jsonResponse(data) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

async function finnhub(path, params = {}) {
  const url = new URL(`https://finnhub.io/api/v1${path}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const res = await fetch(url, {
    headers: { "X-Finnhub-Token": FINNHUB_API_KEY },
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Finnhub error ${res.status}: ${text}`);

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
  if (!res.ok) throw new Error(`Twelve Data error ${res.status}: ${text}`);

  const data = JSON.parse(text);
  if (data.status === "error") {
    throw new Error(`Twelve Data API error: ${data.message || JSON.stringify(data)}`);
  }

  return data;
}

async function fred(path, params = {}) {
  const url = new URL(`https://api.stlouisfed.org/fred${path}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  url.searchParams.set("api_key", FRED_API_KEY);
  url.searchParams.set("file_type", "json");

  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error(`FRED error ${res.status}: ${text}`);

  return JSON.parse(text);
}

const server = new McpServer({
  name: "financial-data-mcp",
  version: "1.2.0",
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
    return jsonResponse(await finnhub("/quote", { symbol }));
  }
);

server.tool(
  "search_symbol",
  "Search for stock symbols using Finnhub.",
  {
    q: z.string().describe("Search query, e.g. Apple or ASML"),
  },
  async ({ q }) => {
    return jsonResponse(await finnhub("/search", { q }));
  }
);

server.tool(
  "get_company_profile",
  "Get company profile information from Finnhub.",
  {
    symbol: z.string().describe("Stock ticker, e.g. AAPL"),
  },
  async ({ symbol }) => {
    return jsonResponse(await finnhub("/stock/profile2", { symbol }));
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
    return jsonResponse(await finnhub("/stock/metric", { symbol, metric }));
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
    return jsonResponse(await finnhub("/company-news", { symbol, from, to }));
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
    return jsonResponse(await finnhub("/stock/dividend", { symbol, from, to }));
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
    return jsonResponse(await twelveData("/price", { symbol }));
  }
);

server.tool(
  "td_get_quote",
  "Get quote data from Twelve Data.",
  {
    symbol: z.string().describe("Symbol, e.g. AAPL, MSFT, ASML"),
  },
  async ({ symbol }) => {
    return jsonResponse(await twelveData("/quote", { symbol }));
  }
);

server.tool(
  "td_get_time_series",
  "Get OHLCV time series from Twelve Data.",
  {
    symbol: z.string().describe("Symbol, e.g. AAPL"),
    interval: z
      .string()
      .default("1day")
      .describe("Examples: 1min, 5min, 15min, 1h, 1day, 1week, 1month"),
    outputsize: z.number().optional().describe("Number of data points"),
    start_date: z.string().optional().describe("YYYY-MM-DD or YYYY-MM-DD HH:MM:SS"),
    end_date: z.string().optional().describe("YYYY-MM-DD or YYYY-MM-DD HH:MM:SS"),
  },
  async ({ symbol, interval, outputsize, start_date, end_date }) => {
    return jsonResponse(
      await twelveData("/time_series", {
        symbol,
        interval,
        outputsize,
        start_date,
        end_date,
      })
    );
  }
);

server.tool(
  "td_search_symbol",
  "Search symbols using Twelve Data.",
  {
    symbol: z.string().describe("Search query, e.g. Apple, ASML, Microsoft"),
  },
  async ({ symbol }) => {
    return jsonResponse(await twelveData("/symbol_search", { symbol }));
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
    return jsonResponse(await twelveData("/stocks", { exchange, country, type }));
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
    return jsonResponse(await twelveData("/etfs", { exchange, country }));
  }
);

server.tool(
  "td_get_forex_pairs",
  "Get available forex pairs from Twelve Data.",
  {},
  async () => {
    return jsonResponse(await twelveData("/forex_pairs"));
  }
);

server.tool(
  "td_get_cryptocurrencies",
  "Get available cryptocurrencies from Twelve Data.",
  {},
  async () => {
    return jsonResponse(await twelveData("/cryptocurrencies"));
  }
);

/**
 * FRED tools
 */

server.tool(
  "fred_get_series_observations",
  "Get macroeconomic time series observations from FRED.",
  {
    series_id: z.string().describe("FRED series ID, e.g. FEDFUNDS, CPIAUCSL, UNRATE, GDP, DGS10"),
    observation_start: z.string().optional().describe("YYYY-MM-DD"),
    observation_end: z.string().optional().describe("YYYY-MM-DD"),
    units: z.string().optional().describe("Examples: lin, chg, ch1, pch, pc1, pca"),
    frequency: z.string().optional().describe("Examples: d, w, m, q, a"),
    limit: z.number().optional(),
    sort_order: z.string().optional().describe("asc or desc"),
  },
  async ({
    series_id,
    observation_start,
    observation_end,
    units,
    frequency,
    limit,
    sort_order,
  }) => {
    return jsonResponse(
      await fred("/series/observations", {
        series_id,
        observation_start,
        observation_end,
        units,
        frequency,
        limit,
        sort_order,
      })
    );
  }
);

server.tool(
  "fred_search_series",
  "Search FRED economic data series.",
  {
    search_text: z.string().describe("Search query, e.g. inflation, unemployment, fed funds"),
    limit: z.number().optional(),
    order_by: z.string().optional().describe("Examples: popularity, search_rank, observation_start"),
    sort_order: z.string().optional().describe("asc or desc"),
  },
  async ({ search_text, limit, order_by, sort_order }) => {
    return jsonResponse(
      await fred("/series/search", {
        search_text,
        limit,
        order_by,
        sort_order,
      })
    );
  }
);

server.tool(
  "fred_get_series_info",
  "Get metadata for a FRED economic series.",
  {
    series_id: z.string().describe("FRED series ID, e.g. FEDFUNDS, CPIAUCSL, UNRATE, GDP, DGS10"),
  },
  async ({ series_id }) => {
    return jsonResponse(await fred("/series", { series_id }));
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