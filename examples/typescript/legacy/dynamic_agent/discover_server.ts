/** This file is a server that proxies a few services and serves an index with descriptions of the resources available.
 *
 *
 *
 */

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { logger } from "hono/logger";
import { paymentMiddleware } from "x402-hono";

const app = new Hono();
const port = 4021;
app.use("*", logger());

type IndexEntry = {
  resourceUrl: string;
  resourceDescription: string;
  price: {
    amount: number;
    currency: string;
  };
};

app.use(
  paymentMiddleware(process.env.PAY_TO_ADDRESS as `0x${string}`, {
    "/weather": "$0.01",
    "/stock": "$0.05",
  })
);

app.get("/", (c) => {
  const resources: IndexEntry[] = [
    {
      resourceUrl: "http://localhost:4021/weather",
      resourceDescription:
        "Returns the 7 day forecast for weather in a city. Must include city as a query parameter escaped properly to be url safe (ex: 'http://localhost:4021/weather?city=London')",
      price: {
        amount: 0.01,
        currency: "USD",
      },
    },
    {
      resourceUrl: "http://localhost:4021/stock",
      resourceDescription:
        "Returns the last 5 days of stock data for a given stock symbol. Must include symbol as a query parameter escaped properly to be url safe (ex: 'http://localhost:4021/stock?symbol=AAPL')",
      price: {
        amount: 0.05,
        currency: "USD",
      },
    },
  ];
  return c.json(resources);
});


app.get("/weather", async (c) => {
  const city = c.req.query("city");
  console.log("City", city);
  const url = `http://api.weatherapi.com/v1/forecast.json?key=${process.env.WEATHER_API_KEY}&q=${city}&days=7`;

  const response = await fetch(url);
  const data = await response.json();

  return c.json(data);
});


app.get("/stock", async (c) => {
  const symbol = c.req.query("symbol")?.toUpperCase();
  if (!symbol) {
    return c.json({ error: "Symbol is required" }, 400);
  }
  const url = `https://api.marketstack.com/v2/eod?access_key=${process.env.MARKETSTACK_API_KEY}&symbols=${symbol}`;
  const response = await fetch(url);
  const data = await response.json();
  const last5Days = data.data.slice(0, 5);
  const last5DaysWithPrices = last5Days.map((day) => ({
    open: day.open,
    close: day.close,
    high: day.high,
    low: day.low,
    volume: day.volume,
    date: day.date,
    symbol: day.symbol,
  }));
  return c.json(last5DaysWithPrices);
});

console.log(`Resource running on port ${port}`);

serve({
  port: port,
  fetch: app.fetch,
});
