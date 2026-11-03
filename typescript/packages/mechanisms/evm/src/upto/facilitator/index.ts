// Note: No register.ts helper — V1 backward compatibility is not needed for upto.
// Use direct class instantiation: facilitator.register("eip155:*", new UptoEvmScheme(signer))
export { UptoEvmScheme } from "./scheme";
export {
  buildUptoEIP3009SettleArgs,
  settleUptoEIP3009,
  verifyUptoEIP3009,
  type VerifyUptoEIP3009Options,
} from "./eip3009";
