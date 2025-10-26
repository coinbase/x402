import { createPaymentHeader as createPaymentHeaderExactEVM } from "../schemes/exact/evm/client";
import { createPaymentHeader as createPaymentHeaderExactSVM } from "../schemes/exact/svm/client";
import { createPaymentHeader as createPaymentHeaderExactHedera } from "../schemes/exact/hedera/client";
import { verify as verifyExactEvm, settle as settleExactEvm } from "../schemes/exact/evm";
import { verify as verifyExactSvm, settle as settleExactSvm } from "../schemes/exact/svm";
import { verify as verifyExactHedera, settle as settleExactHedera } from "../schemes/exact/hedera";

export const strategy = {
  createPaymentHeader: {
    evm: createPaymentHeaderExactEVM,
    svm: createPaymentHeaderExactSVM,
    hedera: createPaymentHeaderExactHedera,
  },
  verify: {
    evm: verifyExactEvm,
    svm: verifyExactSvm,
    hedera: verifyExactHedera,
  },
  settle: {
    evm: settleExactEvm,
    svm: settleExactSvm,
    hedera: settleExactHedera,
  },
} as const;

export type Strategy = typeof strategy;

