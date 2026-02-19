// Client exports
export { ExactAptosScheme as ExactAptosClient } from "./client";
export { registerExactAptosScheme as registerExactAptosClient } from "./client/register";
export type { AptosClientConfig } from "./client/register";

// Facilitator exports
export { ExactAptosScheme as ExactAptosFacilitator } from "./facilitator";
export { registerExactAptosScheme as registerExactAptosFacilitator } from "./facilitator/register";
export type { AptosFacilitatorConfig } from "./facilitator/register";

// Server exports
export { ExactAptosScheme as ExactAptosServer } from "./server";
export { registerExactAptosScheme as registerExactAptosServer } from "./server/register";
export type { AptosServerConfig } from "./server/register";
