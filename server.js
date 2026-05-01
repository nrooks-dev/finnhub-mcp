import express from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY;
const FRED_API_KEY = process.env.FRED_API_KEY;
const FMP_API_KEY = process.env.FMP_API_KEY;

if (!FINNHUB_API_KEY) throw new Error("Missing FINNHUB_API_KEY");
if (!TWELVE_DATA_API_KEY) throw new Error("Missing TWELVE_DATA_API_KEY");
if (!FRED_API_KEY) throw new Error("Missing FRED_API_KEY");
if (!FMP_API_KEY) throw new Error("Missing FMP_API_KEY");

const app = express();
app.use(express.json());

function jsonResponse(data) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

async function apiGet(baseUrl, path, params = {}, apiKeyParam = null, apiKey = null) {
  const url = new URL(`${baseUrl}${path}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  if (apiKeyParam && apiKey) {
    url.searchParams.set(apiKeyParam, apiKey);
  }

  const res = await fetch(url);
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${text}`);
  }

  return JSON.parse(text);
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
  const data = await apiGet(
    "https://api.twelvedata.com",
    path,
    params,
    "apikey",
    TWELVE_DATA_API_KEY
  );

  if (data.status === "error") {
    throw new Error(`Twelve Data API error: ${data.message || JSON.stringify(data)}`);
  }

  return data;
}

async function fred(path, params = {}) {
  return apiGet(
    "https://api.stlouisfed.org/fred",
    path,
    { ...params, file_type: "json" },
    "api_key",
    FRED_API_KEY
  );
}

async function fmp(path, params = {}) {
  return apiGet(
    "https://financialmodelingprep.com/stable",
    path,
    params,
    "apikey",
    FMP_API_KEY
  );
}

const server = new McpServer({
  name: "financial-data-mcp",
  version: "1.3.0",
});

/**
 * Finnhub
 */

server.tool(
  "get_quote",
  "Get the latest quote for a stock symbol from Finnhub.",
  { symbol: z.string() },
  async ({ symbol }) => jsonResponse(await finnhub("/quote", { symbol }))
);

server.tool(
  "search_symbol",
  "Search for stock symbols using Finnhub.",
  { q: z.string() },
  async ({ q }) => jsonResponse(await finnhub("/search", { q }))
);

server.tool(
  "get_company_profile",
  "Get company profile information from Finnhub.",
  { symbol: z.string() },
  async ({ symbol }) => jsonResponse(await finnhub("/stock/profile2", { symbol }))
);

server.tool(
  "get_company_metrics",
  "Get company financial metrics from Finnhub.",
  {
    symbol: z.string(),
    metric: z.string().default("all"),
  },
  async ({ symbol, metric }) =>
    jsonResponse(await finnhub("/stock/metric", { symbol, metric }))
);

server.tool(
  "get_company_news",
  "Get company news from Finnhub for a date range.",
  {
    symbol: z.string(),
    from: z.string().describe("YYYY-MM-DD"),
    to: z.string().describe("YYYY-MM-DD"),
  },
  async ({ symbol, from, to }) =>
    jsonResponse(await finnhub("/company-news", { symbol, from, to }))
);

server.tool(
  "get_dividends",
  "Get dividend history from Finnhub.",
  {
    symbol: z.string(),
    from: z.string().describe("YYYY-MM-DD"),
    to: z.string().describe("YYYY-MM-DD"),
  },
  async ({ symbol, from, to }) =>
    jsonResponse(await finnhub("/stock/dividend", { symbol, from, to }))
);

/**
 * Twelve Data
 */

server.tool(
  "td_get_price",
  "Get latest price from Twelve Data.",
  { symbol: z.string() },
  async ({ symbol }) => jsonResponse(await twelveData("/price", { symbol }))
);

server.tool(
  "td_get_quote",
  "Get quote data from Twelve Data.",
  { symbol: z.string() },
  async ({ symbol }) => jsonResponse(await twelveData("/quote", { symbol }))
);

server.tool(
  "td_get_time_series",
  "Get OHLCV time series from Twelve Data.",
  {
    symbol: z.string(),
    interval: z.string().default("1day"),
    outputsize: z.number().optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
  },
  async ({ symbol, interval, outputsize, start_date, end_date }) =>
    jsonResponse(
      await twelveData("/time_series", {
        symbol,
        interval,
        outputsize,
        start_date,
        end_date,
      })
    )
);

server.tool(
  "td_search_symbol",
  "Search symbols using Twelve Data.",
  { symbol: z.string() },
  async ({ symbol }) => jsonResponse(await twelveData("/symbol_search", { symbol }))
);

server.tool(
  "td_get_stocks",
  "Get stock universe from Twelve Data.",
  {
    exchange: z.string().optional(),
    country: z.string().optional(),
    type: z.string().optional(),
  },
  async ({ exchange, country, type }) =>
    jsonResponse(await twelveData("/stocks", { exchange, country, type }))
);

server.tool(
  "td_get_etfs",
  "Get ETF universe from Twelve Data.",
  {
    exchange: z.string().optional(),
    country: z.string().optional(),
  },
  async ({ exchange, country }) =>
    jsonResponse(await twelveData("/etfs", { exchange, country }))
);

server.tool(
  "td_get_forex_pairs",
  "Get available forex pairs from Twelve Data.",
  {},
  async () => jsonResponse(await twelveData("/forex_pairs"))
);

server.tool(
  "td_get_cryptocurrencies",
  "Get available cryptocurrencies from Twelve Data.",
  {},
  async () => jsonResponse(await twelveData("/cryptocurrencies"))
);

/**
 * FRED
 */

server.tool(
  "fred_get_series_observations",
  "Get macroeconomic time series observations from FRED.",
  {
    series_id: z.string(),
    observation_start: z.string().optional(),
    observation_end: z.string().optional(),
    units: z.string().optional(),
    frequency: z.string().optional(),
    limit: z.number().optional(),
    sort_order: z.string().optional(),
  },
  async ({
    series_id,
    observation_start,
    observation_end,
    units,
    frequency,
    limit,
    sort_order,
  }) =>
    jsonResponse(
      await fred("/series/observations", {
        series_id,
        observation_start,
        observation_end,
        units,
        frequency,
        limit,
        sort_order,
      })
    )
);

server.tool(
  "fred_search_series",
  "Search FRED economic data series.",
  {
    search_text: z.string(),
    limit: z.number().optional(),
    order_by: z.string().optional(),
    sort_order: z.string().optional(),
  },
  async ({ search_text, limit, order_by, sort_order }) =>
    jsonResponse(
      await fred("/series/search", {
        search_text,
        limit,
        order_by,
        sort_order,
      })
    )
);

server.tool(
  "fred_get_series_info",
  "Get metadata for a FRED economic series.",
  { series_id: z.string() },
  async ({ series_id }) => jsonResponse(await fred("/series", { series_id }))
);

/**
 * FMP
 */

server.tool(
  "fmp_get_company_profile",
  "Get company profile from FMP.",
  { symbol: z.string() },
  async ({ symbol }) => jsonResponse(await fmp("/profile", { symbol }))
);

server.tool(
  "fmp_get_key_metrics_ttm",
  "Get TTM key metrics from FMP.",
  { symbol: z.string() },
  async ({ symbol }) => jsonResponse(await fmp("/key-metrics-ttm", { symbol }))
);

server.tool(
  "fmp_get_ratios_ttm",
  "Get TTM financial ratios from FMP.",
  { symbol: z.string() },
  async ({ symbol }) => jsonResponse(await fmp("/ratios-ttm", { symbol }))
);

server.tool(
  "fmp_get_income_statement",
  "Get income statement history from FMP.",
  {
    symbol: z.string(),
    period: z.string().optional().describe("annual or quarter"),
    limit: z.number().optional(),
  },
  async ({ symbol, period, limit }) =>
    jsonResponse(await fmp("/income-statement", { symbol, period, limit }))
);

server.tool(
  "fmp_get_balance_sheet_statement",
  "Get balance sheet statement history from FMP.",
  {
    symbol: z.string(),
    period: z.string().optional().describe("annual or quarter"),
    limit: z.number().optional(),
  },
  async ({ symbol, period, limit }) =>
    jsonResponse(await fmp("/balance-sheet-statement", { symbol, period, limit }))
);

server.tool(
  "fmp_get_cash_flow_statement",
  "Get cash flow statement history from FMP.",
  {
    symbol: z.string(),
    period: z.string().optional().describe("annual or quarter"),
    limit: z.number().optional(),
  },
  async ({ symbol, period, limit }) =>
    jsonResponse(await fmp("/cash-flow-statement", { symbol, period, limit }))
);

server.tool(
  "fmp_get_financial_growth",
  "Get financial growth metrics from FMP.",
  {
    symbol: z.string(),
    period: z.string().optional().describe("annual or quarter"),
    limit: z.number().optional(),
  },
  async ({ symbol, period, limit }) =>
    jsonResponse(await fmp("/financial-growth", { symbol, period, limit }))
);

server.tool(
  "fmp_get_dividends",
  "Get dividend history from FMP.",
  {
    symbol: z.string(),
    limit: z.number().optional(),
  },
  async ({ symbol, limit }) =>
    jsonResponse(await fmp("/dividends", { symbol, limit }))
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