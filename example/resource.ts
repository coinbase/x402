import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { hono } from "x402/server";

const app = new Hono();
const port = 4021;

app.use(
  "/joke",
  hono.paymentMiddleware(
    "$0.01",
    "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
    {
      description: "joke",
      mimeType: "text/plain",
    }
  )
);

app.use("*", logger());

app.get("/joke", (c) => {
  const jokes = [
    "Why do programmers prefer dark mode? Because light attracts bugs!",
    "Why did the developer go broke? Because he used up all his cache!",
    "What's a programmer's favorite place? The foo bar!",
    "Why do programmers always mix up Halloween and Christmas? Because Oct 31 equals Dec 25!",
    "Why did the programmer quit his job? Because he didn't get arrays!",
  ];

  const randomJoke = jokes[Math.floor(Math.random() * jokes.length)];
  return c.json({ joke: randomJoke });
});

console.log(`Resource running on port ${port}`);

serve({
  port: port,
  fetch: app.fetch,
});
