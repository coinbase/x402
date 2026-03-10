export { ExactAvmSchemeV1 } from '../exact/v1'
export {
  V1_ALGORAND_MAINNET,
  V1_ALGORAND_TESTNET,
  V1_NETWORKS,
  V1_TO_CAIP2,
  CAIP2_TO_V1,
} from '../constants'

/**
 * V1 network to CAIP-2 mapping
 */
export const AVM_NETWORK_CAIP2_MAP = {
  'algorand-mainnet': 'algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=',
  'algorand-testnet': 'algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=',
} as const

export type AvmNetworkV1 = keyof typeof AVM_NETWORK_CAIP2_MAP

export const NETWORKS: string[] = Object.keys(AVM_NETWORK_CAIP2_MAP)
