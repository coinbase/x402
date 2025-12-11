import { ListDiscoveryResourcesResponse } from "x402/types";
import { X402RequestParams } from "./utils/x402Client";

export interface ElectronWindow extends Window {
  electron: {
    ipcRenderer: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      invoke: (channel: string, ...args: any[]) => Promise<any>;
    };
    OnSignMessage: (callback: (message: string) => Promise<string>) => void;
    OnDiscoveryList: (callback: () => Promise<ListDiscoveryResourcesResponse>) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    OnMakeX402Request: (callback: (params: X402RequestParams) => Promise<any>) => void;
    OnGetWalletAddress: (callback: () => Promise<string>) => void;
  };
}
