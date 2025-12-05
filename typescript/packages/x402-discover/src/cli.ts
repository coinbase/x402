#!/usr/bin/env node
import { Command } from "commander";
import { searchTools, fetchAllResources, fetchPricing, listFacilitators } from "./client.js";

const program = new Command();

program
  .name("x402-discover")
  .description("Discover x402-enabled tools and APIs")
  .version("0.1.0");

program
  .command("search <query>")
  .description("Search for tools by keyword")
  .option("-l, --limit <number>", "Max results", "20")
  .action(async (query: string, options: { limit: string }) => {
    const limit = parseInt(options.limit);
    console.log(`Searching for "${query}"...\n`);

    const tools = await searchTools(query);
    const results = tools.slice(0, limit);

    if (results.length === 0) {
      console.log("No tools found.");
      return;
    }

    console.log(`Found ${tools.length} tools (showing ${results.length}):\n`);

    for (const tool of results) {
      console.log(`  ${tool.url}`);
      console.log(`    Price: ${tool.price} (${tool.network})`);
      if (tool.description) {
        console.log(`    ${tool.description}`);
      }
      console.log();
    }
  });

program
  .command("list")
  .description("List all available tools")
  .option("-l, --limit <number>", "Max results", "50")
  .option("-n, --network <network>", "Filter by network")
  .option("-v, --verbose", "Show facilitator status")
  .action(async (options: { limit: string; network?: string; verbose?: boolean }) => {
    const limit = parseInt(options.limit);
    console.log("Fetching tools from facilitators...\n");

    const { tools: allTools, status } = await fetchAllResources();

    if (options.verbose) {
      console.log("Facilitator Status:");
      for (const s of status) {
        const icon = s.status === "success" ? "✓" : s.status === "partial" ? "◐" : "✗";
        const cached = s.cached ? " (cached)" : "";
        console.log(`  ${icon} ${s.facilitatorName}: ${s.toolCount} tools${cached}`);
        if (s.error) {
          console.log(`    ⚠ ${s.error}`);
        }
      }
      console.log();
    }

    let tools = allTools;
    if (options.network) {
      tools = tools.filter((t) =>
        t.network.toLowerCase().includes(options.network!.toLowerCase())
      );
    }

    const results = tools.slice(0, limit);

    if (results.length === 0) {
      console.log("No tools found.");
      return;
    }

    console.log(`Found ${tools.length} tools (showing ${results.length}):\n`);

    for (const tool of results) {
      console.log(`  ${tool.url}`);
      console.log(`    Price: ${tool.price} | Network: ${tool.network}`);
      if (tool.description) {
        console.log(`    ${tool.description}`);
      }
      console.log();
    }
  });

program
  .command("price <url>")
  .description("Fetch pricing for a specific endpoint")
  .action(async (url: string) => {
    console.log(`Fetching pricing for ${url}...\n`);

    const pricing = await fetchPricing(url);

    if (!pricing || pricing.length === 0) {
      console.log("Could not fetch pricing. Endpoint may be down or not x402-enabled.");
      return;
    }

    console.log("Payment options:\n");

    for (const option of pricing) {
      const price = BigInt(option.maxAmountRequired);
      const priceFormatted = `$${(Number(price) / 1e6).toFixed(4)}`;

      console.log(`  Network: ${option.network}`);
      console.log(`  Price: ${priceFormatted} (${option.maxAmountRequired} atomic units)`);
      console.log(`  Asset: ${option.asset}`);
      console.log(`  Pay to: ${option.payTo}`);
      if (option.description) {
        console.log(`  Description: ${option.description}`);
      }
      console.log();
    }
  });

program
  .command("facilitators")
  .description("List known facilitators")
  .action(() => {
    const facilitators = listFacilitators();

    console.log("Known x402 facilitators:\n");

    for (const f of facilitators) {
      console.log(`  ${f.name}`);
      console.log(`    ${f.url}`);
      console.log();
    }
  });

program.parse();
