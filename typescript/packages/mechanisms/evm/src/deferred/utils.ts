import { encodeAbiParameters, keccak256 } from "viem";
import { channelConfigComponents } from "./abi";
import type { ChannelConfig } from "./types";

const channelConfigAbiType = [{ type: "tuple", components: channelConfigComponents }] as const;

/**
 * Computes the channel id from a {@link ChannelConfig} struct, matching the on-chain
 * `getChannelId`: `keccak256(abi.encode(channelConfig))`.
 *
 * @param config - The immutable channel configuration.
 * @returns The `bytes32` channel id as a hex string.
 */
export function computeChannelId(config: ChannelConfig): `0x${string}` {
  const encoded = encodeAbiParameters(channelConfigAbiType, [
    {
      payer: config.payer,
      payerAuthorizer: config.payerAuthorizer,
      receiver: config.receiver,
      receiverAuthorizer: config.receiverAuthorizer,
      token: config.token,
      withdrawDelay: config.withdrawDelay,
      salt: config.salt,
    },
  ]);
  return keccak256(encoded);
}
