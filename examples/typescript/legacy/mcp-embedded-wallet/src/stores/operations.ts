import { createStore } from "zustand/vanilla";
import { useStore } from "zustand/react";

type OperationStatus = "pending" | "success" | "error";

// X402 Payment Requirements (from 402 response)
export interface PaymentRequirements {
  scheme: "exact";
  network: string;
  maxAmountRequired: string; // Atomic units
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string; // Token contract address
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extra?: Record<string, any>;
}

// Settlement info (from X-PAYMENT-RESPONSE header)
export interface SettlementInfo {
  success: boolean;
  transaction: string; // Transaction hash
  network: string;
  payer: string; // Wallet address
}

// EIP-3009 authorization data
export interface AuthorizationData {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
}

// Base operation properties shared by all operation types
interface BaseOperation {
  description: string;
  status: OperationStatus;
  timestamp: Date;
  correlationId?: string; // Links related operations together
}

// HTTP/Protocol request operation
export interface HttpOperation extends BaseOperation {
  type: "http";
  method: string; // GET, POST, etc.
  url: string; // The full URL that was requested
  errorMessage?: string; // Error details if status is "error"

  // X402 specific fields
  maxAmountPerRequest?: number; // Max amount per request
  paymentRequirements?: PaymentRequirements[]; // From 402 response 'accepts'
  selectedPayment?: PaymentRequirements; // Which payment option was chosen
  settlementInfo?: SettlementInfo; // From X-PAYMENT-RESPONSE header
}

// Wallet action operation (signatures, etc.)
export interface WalletOperation extends BaseOperation {
  type: "wallet";
  action: "sign" | "send" | "approve"; // Type of wallet action
  address: string; // Wallet address
  message?: string; // Message that was signed (for sign actions)
  signature?: string; // Resulting signature (for sign actions)
  errorMessage?: string; // Error details if status is "error"

  // X402 specific fields
  authorizationData?: AuthorizationData; // EIP-3009 authorization that was signed
  transactionHash?: string; // Transaction hash when payment is settled
  blockExplorerUrl?: string; // Link to view transaction on block explorer
}

// Union type for all operations
export type Operation = HttpOperation | WalletOperation;

export interface OperationStore {
  operationCount: number;
  operations: Operation[];
  addHttpOperation: (
    description: string,
    status: OperationStatus,
    method: string,
    url: string,
    errorMessage?: string,
    correlationId?: string,
    maxAmountPerRequest?: number,
    paymentRequirements?: PaymentRequirements[],
    selectedPayment?: PaymentRequirements,
    settlementInfo?: SettlementInfo,
  ) => void;
  addWalletOperation: (
    description: string,
    status: OperationStatus,
    action: "sign" | "send" | "approve",
    address: string,
    message?: string,
    signature?: string,
    errorMessage?: string,
    correlationId?: string,
    authorizationData?: AuthorizationData,
  ) => void;
  updateHttpOperation: (index: number, updates: Partial<Omit<HttpOperation, "type">>) => void;
  updateWalletOperation: (index: number, updates: Partial<Omit<WalletOperation, "type">>) => void;
}

// Create the store using createStore for better external access
export const operationStore = createStore<OperationStore>(set => ({
  operationCount: 0,
  operations: [],

  addHttpOperation: (
    description: string,
    status: OperationStatus,
    method: string,
    url: string,
    errorMessage?: string,
    correlationId?: string,
    maxAmountPerRequest?: number,
    paymentRequirements?: PaymentRequirements[],
    selectedPayment?: PaymentRequirements,
    settlementInfo?: SettlementInfo,
  ) =>
    set(state => ({
      operationCount: state.operationCount + 1,
      operations: [
        ...state.operations,
        {
          type: "http",
          description,
          status,
          timestamp: new Date(),
          method,
          url,
          errorMessage,
          correlationId,
          maxAmountPerRequest,
          paymentRequirements,
          selectedPayment,
          settlementInfo,
        },
      ],
    })),

  addWalletOperation: (
    description: string,
    status: OperationStatus,
    action: "sign" | "send" | "approve",
    address: string,
    message?: string,
    signature?: string,
    errorMessage?: string,
    correlationId?: string,
    authorizationData?: AuthorizationData,
  ) =>
    set(state => ({
      operationCount: state.operationCount + 1,
      operations: [
        ...state.operations,
        {
          type: "wallet",
          description,
          status,
          timestamp: new Date(),
          action,
          address,
          message,
          signature,
          errorMessage,
          correlationId,
          authorizationData,
        },
      ],
    })),

  updateHttpOperation: (index: number, updates: Partial<Omit<HttpOperation, "type">>) =>
    set(state => ({
      operations: state.operations.map((operation, i) =>
        i === index && operation.type === "http" ? { ...operation, ...updates } : operation,
      ),
    })),

  updateWalletOperation: (index: number, updates: Partial<Omit<WalletOperation, "type">>) =>
    set(state => ({
      operations: state.operations.map((operation, i) =>
        i === index && operation.type === "wallet" ? { ...operation, ...updates } : operation,
      ),
    })),
}));

// Hook for React components
export const useOperationStore = <T>(selector: (state: OperationStore) => T) =>
  useStore(operationStore, selector);
