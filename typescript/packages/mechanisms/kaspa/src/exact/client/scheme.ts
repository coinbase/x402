/**
 * Client-side x402 scheme implementation for Kaspa.
 *
 * The client constructs a signed Kaspa transaction that pays the
 * required amount to the specified recipient. The signed transaction
 * is included in the x402 payment payload.
 */

import {
  MIN_FEE_SOMPI,
  KAS_NATIVE_ASSET,
  isCovenantAsset,
  validateAsset,
} from "../../constants.js";
import type { ClientKaspaSigner } from "../../signer.js";
import type { ExactKaspaPayloadV2, UtxoEntry, TransactionOutput } from "../../types.js";
import type {
  PaymentRequirements,
  PaymentPayloadResult,
  SchemeNetworkClient,
  PaymentPayloadContext,
} from "@x402/core/types";

/**
 *
 */
export class ExactKaspaScheme implements SchemeNetworkClient {
  readonly scheme = "exact";

  private signer: ClientKaspaSigner;

  /**
   *
   * @param signer
   */
  constructor(signer: ClientKaspaSigner) {
    this.signer = signer;
  }

  /**
   * Create a payment payload for the given requirements.
   *
   * Flow:
   * 1. Parse the required amount from PaymentRequirements
   * 2. Fetch available UTXOs from the client's wallet
   * 3. Select UTXOs that cover amount + fee
   * 4. Construct outputs: payment to recipient + change back to client
   * 5. Sign the transaction via signer
   * 6. Return the signed transaction as the payload
   *
   * @param x402Version
   * @param paymentRequirements
   * @param _context
   */
  async createPaymentPayload(
    x402Version: number,
    paymentRequirements: PaymentRequirements,
    _context?: PaymentPayloadContext,
  ): Promise<PaymentPayloadResult> {
    const { payTo, amount, asset } = paymentRequirements;

    validateAsset(asset);

    const amountSompi = BigInt(amount);
    const fee = MIN_FEE_SOMPI;

    // Fetch available UTXOs
    const availableUtxos = await this.signer.getUtxos();

    let selected: UtxoEntry[];
    let outputs: TransactionOutput[];

    if (isCovenantAsset(asset)) {
      // ── Token payment path ──────────────────────────────────
      // Separate UTXOs: token (matching covenantId) vs KAS (no covenantId)
      const tokenUtxos = availableUtxos.filter(u => u.covenantId === asset);
      const kasUtxos = availableUtxos.filter(u => !u.covenantId);

      // Select token UTXOs to cover the payment amount
      const tokenSelection = selectUtxos(tokenUtxos, amountSompi);
      if (tokenSelection.totalInput < amountSompi) {
        throw new Error(
          `Insufficient token funds: need ${amountSompi} sompi of token ${asset}, have ${tokenSelection.totalInput} sompi`,
        );
      }

      // Select KAS UTXOs to cover the fee
      const kasSelection = selectUtxos(kasUtxos, fee);
      if (kasSelection.totalInput < fee) {
        throw new Error(
          `Insufficient KAS for fee: need ${fee} sompi, have ${kasSelection.totalInput} sompi`,
        );
      }

      // Token inputs first (authorizingInput = 0 references the first token input)
      selected = [...tokenSelection.selected, ...kasSelection.selected];

      outputs = [];

      // Token payment output → recipient
      outputs.push({
        value: amountSompi,
        scriptPublicKey: this.signer.resolveAddress(payTo),
        covenant: { authorizingInput: 0, covenantId: asset },
      });

      // Token change → self
      const tokenChange = tokenSelection.totalInput - amountSompi;
      if (tokenChange > 0n) {
        outputs.push({
          value: tokenChange,
          scriptPublicKey: this.signer.resolveAddress(this.signer.address),
          covenant: { authorizingInput: 0, covenantId: asset },
        });
      }

      // KAS change → self
      const kasChange = kasSelection.totalInput - fee;
      if (kasChange > 0n) {
        outputs.push({
          value: kasChange,
          scriptPublicKey: this.signer.resolveAddress(this.signer.address),
        });
      }
    } else {
      // ── Native KAS payment path (unchanged) ────────────────
      const totalRequired = amountSompi + fee;
      const { selected: kasSelected, totalInput } = selectUtxos(availableUtxos, totalRequired);

      if (totalInput < totalRequired) {
        throw new Error(
          `Insufficient funds: need ${totalRequired} sompi, have ${totalInput} sompi`,
        );
      }

      selected = kasSelected;
      outputs = [
        {
          value: amountSompi,
          scriptPublicKey: this.signer.resolveAddress(payTo),
        },
      ];

      const change = totalInput - totalRequired;
      if (change > 0n) {
        outputs.push({
          value: change,
          scriptPublicKey: this.signer.resolveAddress(this.signer.address),
        });
      }
    }

    // Sign the transaction (signer handles kaspa-wasm TX construction)
    const signedTx = await this.signer.signTransaction(outputs, selected);

    const payload: ExactKaspaPayloadV2 = {
      transaction: signedTx,
    };

    return {
      x402Version,
      payload: payload as unknown as Record<string, unknown>,
    };
  }
}

/**
 * Simple UTXO selection: largest-first.
 * Selects UTXOs until the total covers the required amount.
 *
 * @param utxos
 * @param requiredAmount
 */
export function selectUtxos(
  utxos: UtxoEntry[],
  requiredAmount: bigint,
): { selected: UtxoEntry[]; totalInput: bigint } {
  const sorted = [...utxos].sort((a, b) =>
    a.amount > b.amount ? -1 : a.amount < b.amount ? 1 : 0,
  );

  const selected: UtxoEntry[] = [];
  let totalInput = 0n;

  for (const utxo of sorted) {
    selected.push(utxo);
    totalInput += utxo.amount;
    if (totalInput >= requiredAmount) {
      break;
    }
  }

  return { selected, totalInput };
}
