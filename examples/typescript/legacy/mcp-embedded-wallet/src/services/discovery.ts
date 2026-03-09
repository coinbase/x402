import type { DiscoveryListResponse } from "../../electron";

declare global {
  interface Window {
    electron: {
      ipcRenderer: {
        invoke(channel: "get-discovery-list"): Promise<DiscoveryListResponse>;
        invoke(channel: string, ...args: unknown[]): Promise<unknown>;
      };
    };
  }
}

/**
 * Fetches the list of available x402 discovery items through the Electron IPC bridge.
 * Communicates with the main process to get the current discovery list.
 *
 * @returns {Promise<DiscoveryListResponse>} A promise that resolves to the discovery list response
 * @throws {Error} If the discovery list fetch fails
 */
export async function getDiscoveryList(): Promise<DiscoveryListResponse> {
  try {
    return await window.electron.ipcRenderer.invoke("get-discovery-list");
  } catch (error) {
    console.error("Failed to fetch discovery list:", error);
    throw error;
  }
}
