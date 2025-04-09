import { AxiosInstance, AxiosError } from "axios";
import { paymentDetailsSchema } from "../types/index.js";
import { evm } from "../shared/index.js";
import { createPaymentHeader } from "../client.js";

export function withPaymentInterceptor(
  axiosClient: AxiosInstance,
  walletClient: evm.wallet.SignerWallet,
) {
  axiosClient.interceptors.response.use(
    response => response,
    async (error: AxiosError) => {
      if (!error.response || error.response.status !== 402) {
        return Promise.reject(error);
      }

      try {
        const { paymentDetails } = error.response.data as any;
        const parsed = paymentDetailsSchema.parse(paymentDetails);

        const paymentHeader = await createPaymentHeader(walletClient, parsed);

        const originalConfig = error.config;
        if (!originalConfig || !originalConfig.headers) {
          return Promise.reject(new Error("Missing axios request configuration"));
        }

        if ((originalConfig as any).__is402Retry) {
          return Promise.reject(error);
        }

        (originalConfig as any).__is402Retry = true;

        originalConfig.headers["X-PAYMENT"] = paymentHeader;
        originalConfig.headers["Access-Control-Expose-Headers"] = "X-PAYMENT-RESPONSE";

        const secondResponse = await axiosClient.request(originalConfig);
        return secondResponse;
      } catch (paymentError) {
        return Promise.reject(paymentError);
      }
    },
  );

  return axiosClient;
}
