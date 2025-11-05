import {
  estimateComputeUnitLimitFactory,
  getSetComputeUnitLimitInstruction,
  setTransactionMessageComputeUnitPrice,
} from "@solana-program/compute-budget";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  fetchMint,
  findAssociatedTokenPda,
  getTransferCheckedInstruction,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";
import {
  appendTransactionMessageInstructions,
  createTransactionMessage,
  fetchEncodedAccount,
  getBase64EncodedWireTransaction,
  partiallySignTransactionMessageWithSigners,
  pipe,
  prependTransactionMessageInstruction,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
} from "@solana/kit";
import type { PaymentPayload, PaymentRequirements, SchemeNetworkClient } from "@x402/core/types";
import { DEFAULT_COMPUTE_UNIT_PRICE } from "../constants";
import type { ClientSvmConfig, ClientSvmSigner } from "../signer";
import type { ExactSvmPayloadV2 } from "../types";
import { createRpcClient } from "../utils";

/**
 * SVM client implementation for the Exact payment scheme.
 */
export class ExactSvmClient implements SchemeNetworkClient {
  readonly scheme = "exact";

  /**
   * Creates a new ExactSvmClient instance.
   *
   * @param signer - The SVM signer for client operations
   * @param config - Optional configuration with custom RPC URL
   * @returns ExactSvmClient instance
   */
  constructor(
    private readonly signer: ClientSvmSigner,
    private readonly config?: ClientSvmConfig,
  ) {}

  /**
   * Creates a payment payload for the Exact scheme.
   *
   * @param x402Version - The x402 protocol version
   * @param paymentRequirements - The payment requirements
   * @returns Promise resolving to a payment payload
   */
  async createPaymentPayload(
    x402Version: number,
    paymentRequirements: PaymentRequirements,
  ): Promise<Pick<PaymentPayload, "x402Version" | "payload">> {
    const rpc = createRpcClient(paymentRequirements.network, this.config?.rpcUrl);

    const tokenMint = await fetchMint(rpc, paymentRequirements.asset as Address);
    const tokenProgramAddress = tokenMint.programAddress;

    if (
      tokenProgramAddress.toString() !== TOKEN_PROGRAM_ADDRESS.toString() &&
      tokenProgramAddress.toString() !== TOKEN_2022_PROGRAM_ADDRESS.toString()
    ) {
      throw new Error("Asset was not created by a known token program");
    }

    const [sourceATA] = await findAssociatedTokenPda({
      mint: paymentRequirements.asset as Address,
      owner: this.signer.address,
      tokenProgram: tokenProgramAddress,
    });

    const [destinationATA] = await findAssociatedTokenPda({
      mint: paymentRequirements.asset as Address,
      owner: paymentRequirements.payTo as Address,
      tokenProgram: tokenProgramAddress,
    });

    const sourceAccount = await fetchEncodedAccount(rpc, sourceATA);
    if (!sourceAccount.exists) {
      throw new Error(
        `invalid_exact_svm_payload_ata_not_found: Source ATA does not exist for client ${this.signer.address}`,
      );
    }

    const destAccount = await fetchEncodedAccount(rpc, destinationATA);
    if (!destAccount.exists) {
      throw new Error(
        `invalid_exact_svm_payload_ata_not_found: Destination ATA does not exist for recipient ${paymentRequirements.payTo}`,
      );
    }

    const transferIx = getTransferCheckedInstruction(
      {
        source: sourceATA,
        mint: paymentRequirements.asset as Address,
        destination: destinationATA,
        authority: this.signer,
        amount: BigInt(paymentRequirements.amount),
        decimals: tokenMint.data.decimals,
      },
      { programAddress: tokenProgramAddress },
    );

    // Facilitator must provide feePayer to cover transaction fees
    const feePayer = paymentRequirements.extra?.feePayer as Address;
    if (!feePayer) {
      throw new Error("feePayer is required in paymentRequirements.extra for SVM transactions");
    }

    const txToSimulate = pipe(
      createTransactionMessage({ version: 0 }),
      tx => setTransactionMessageComputeUnitPrice(DEFAULT_COMPUTE_UNIT_PRICE, tx),
      tx => setTransactionMessageFeePayer(feePayer, tx),
      tx => appendTransactionMessageInstructions([transferIx], tx),
    );

    const estimateComputeUnitLimit = estimateComputeUnitLimitFactory({ rpc });
    const estimatedUnits = await estimateComputeUnitLimit(txToSimulate);
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

    const tx = pipe(
      txToSimulate,
      tx =>
        prependTransactionMessageInstruction(
          getSetComputeUnitLimitInstruction({ units: estimatedUnits }),
          tx,
        ),
      tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    );

    const signedTransaction = await partiallySignTransactionMessageWithSigners(tx);
    const base64EncodedWireTransaction = getBase64EncodedWireTransaction(signedTransaction);

    const payload: ExactSvmPayloadV2 = {
      transaction: base64EncodedWireTransaction,
    };

    return {
      x402Version,
      payload,
    };
  }
}
