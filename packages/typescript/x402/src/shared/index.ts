export * as evm from "./evm/index.js";

export function safeBase64Encode(data: string): string {
  if (typeof window !== "undefined") {
    return window.btoa(data);
  }
  return Buffer.from(data).toString("base64");
}

export function safeBase64Decode(data: string): string {
  if (typeof window !== "undefined") {
    return window.atob(data);
  }
  return Buffer.from(data, "base64").toString("utf-8");
}
