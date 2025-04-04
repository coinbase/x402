declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: Array<any> }) => Promise<any>;
      on: (event: string, handler: (...args: any[]) => void) => void;
    };
    x402: {
      paymentDetails: any;
      isTestnet: boolean;
      currentUrl: string;
      state: {
        publicClient: any;
        chain: any;
        walletClient: any;
      };
      config: {
        chainConfig: Record<
          string,
          {
            usdcAddress: string;
            usdcName: string;
          }
        >;
      };
    };
  }
}

export {};
