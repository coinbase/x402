import { createInterface } from "readline";
import { createAgent } from "./createAgent.js";
import { HumanMessage } from "@langchain/core/messages";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

async function main() {
  try {
    // Initialize the agent
    console.log("Initializing agent...");
    const { agent, config } = await createAgent();
    console.log("Agent initialized successfully!");

    // Create readline interface
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Function to get user input
    const question = (prompt: string): Promise<string> =>
      new Promise(resolve => rl.question(prompt, resolve));

    console.log("\nWelcome to the AgentKit Chatbot!");
    console.log("Type 'q' or 'quit' to exit");
    console.log("-------------------");

    try {
      // Main chat loop
      while (true) {
        const userInput = await question("\nYou: ");

        // Check for exit command
        if (userInput.toLowerCase() === "q" || userInput.toLowerCase() === "quit") {
          console.log("\nGoodbye!");
          break;
        }

        try {
          // Get streaming response from agent
          const stream = await agent.stream({
            messages: [new HumanMessage(userInput)]
          }, config);

          // Process the stream chunks
          console.log("\nAgent: ");
          for await (const chunk of stream) {
            if ("agent" in chunk) {
              // Agent's direct response
              process.stdout.write(chunk.agent.messages[0].content);
            } else if ("tools" in chunk) {
              // Tool execution updates
              console.log("\n[Tool Execution]:", chunk.tools.messages[0].content);
              console.log("-------------------");
            }
          }
          console.log("\n-------------------");
        } catch (error) {
          console.error("\nError getting agent response:", error instanceof Error ? error.message : error);
          console.log("-------------------");
        }
      }
    } finally {
      rl.close();
    }
  } catch (error) {
    console.error("Failed to initialize agent:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Run the main function
main().catch((error) => {
  console.error("Unexpected error:", error instanceof Error ? error.message : error);
  process.exit(1);
}); 