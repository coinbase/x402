export type TriggerType = 'time' | 'agent' | 'condition'
export type WorkflowStatus = 'completed' | 'running' | 'failed' | 'pending'
export type StepStatus = 'success' | 'failed' | 'retried' | 'pending' | 'running'

export interface WorkflowStep {
  id: string
  name: string
  timestamp: string
  status: StepStatus
  transactionHash?: string
  agentDecisionReason?: string
  errorMessage?: string
  duration?: string
  retryCount?: number
  metadata?: Record<string, string>
}

export interface Workflow {
  id: string
  triggerType: TriggerType
  status: WorkflowStatus
  startedAt: string
  completedAt?: string
  steps: WorkflowStep[]
}

export const mockWorkflows: Workflow[] = [
  {
    id: 'wf_0x8a4d2e1f9c3b',
    triggerType: 'agent',
    status: 'completed',
    startedAt: '2024-01-15T14:32:11Z',
    completedAt: '2024-01-15T14:32:47Z',
    steps: [
      {
        id: 'step_001',
        name: 'Initialize Payment Context',
        timestamp: '2024-01-15T14:32:11Z',
        status: 'success',
        transactionHash: '0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b',
        agentDecisionReason: 'User balance sufficient for transaction',
        duration: '1.2s',
      },
      {
        id: 'step_002',
        name: 'Validate x402 Headers',
        timestamp: '2024-01-15T14:32:12Z',
        status: 'success',
        transactionHash: '0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b',
        agentDecisionReason: 'Headers conform to x402 specification v2.1',
        duration: '0.8s',
      },
      {
        id: 'step_003',
        name: 'Execute Token Transfer',
        timestamp: '2024-01-15T14:32:14Z',
        status: 'success',
        transactionHash: '0x2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c',
        agentDecisionReason: 'Gas price within acceptable range',
        duration: '12.4s',
      },
      {
        id: 'step_004',
        name: 'Confirm Settlement',
        timestamp: '2024-01-15T14:32:27Z',
        status: 'success',
        transactionHash: '0x3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d',
        agentDecisionReason: 'Block confirmations met threshold (6/6)',
        duration: '20.1s',
      },
    ],
  },
  {
    id: 'wf_0x3b7c9e2a1d5f',
    triggerType: 'time',
    status: 'failed',
    startedAt: '2024-01-15T13:15:00Z',
    completedAt: '2024-01-15T13:15:34Z',
    steps: [
      {
        id: 'step_001',
        name: 'Scheduled Payment Trigger',
        timestamp: '2024-01-15T13:15:00Z',
        status: 'success',
        transactionHash: '0x4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e',
        agentDecisionReason: 'Cron schedule matched: 0 */6 * * *',
        duration: '0.3s',
      },
      {
        id: 'step_002',
        name: 'Fetch Payment Queue',
        timestamp: '2024-01-15T13:15:01Z',
        status: 'success',
        agentDecisionReason: '3 pending payments retrieved from queue',
        duration: '2.1s',
      },
      {
        id: 'step_003',
        name: 'Batch Token Approval',
        timestamp: '2024-01-15T13:15:03Z',
        status: 'retried',
        transactionHash: '0x5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f',
        agentDecisionReason: 'Initial attempt failed due to nonce conflict, retrying with incremented nonce',
        duration: '8.7s',
        retryCount: 2,
      },
      {
        id: 'step_004',
        name: 'Execute Batch Transfer',
        timestamp: '2024-01-15T13:15:12Z',
        status: 'failed',
        transactionHash: '0x6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a',
        errorMessage: 'INSUFFICIENT_FUNDS: Contract balance 0.0042 ETH below required 0.15 ETH for batch execution',
        agentDecisionReason: 'Attempted execution despite low balance warning',
        duration: '22.3s',
      },
    ],
  },
  {
    id: 'wf_0x9d1e4f8a2c6b',
    triggerType: 'condition',
    status: 'running',
    startedAt: '2024-01-15T14:45:22Z',
    steps: [
      {
        id: 'step_001',
        name: 'Price Threshold Monitor',
        timestamp: '2024-01-15T14:45:22Z',
        status: 'success',
        agentDecisionReason: 'ETH/USDC crossed $2,450 threshold',
        duration: '0.1s',
      },
      {
        id: 'step_002',
        name: 'Calculate Optimal Swap',
        timestamp: '2024-01-15T14:45:23Z',
        status: 'success',
        agentDecisionReason: 'Best route: ETH → WETH → USDC via Uniswap V3',
        duration: '1.8s',
        metadata: {
          'slippage': '0.5%',
          'expectedOutput': '4,892.31 USDC',
        },
      },
      {
        id: 'step_003',
        name: 'Submit Swap Transaction',
        timestamp: '2024-01-15T14:45:25Z',
        status: 'running',
        transactionHash: '0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b',
        agentDecisionReason: 'Transaction submitted to mempool',
      },
    ],
  },
  {
    id: 'wf_0x2c5a8d1e9f3b',
    triggerType: 'agent',
    status: 'completed',
    startedAt: '2024-01-15T12:00:05Z',
    completedAt: '2024-01-15T12:01:12Z',
    steps: [
      {
        id: 'step_001',
        name: 'Agent Authorization Request',
        timestamp: '2024-01-15T12:00:05Z',
        status: 'success',
        agentDecisionReason: 'API key validated, scope: payments.write',
        duration: '0.4s',
      },
      {
        id: 'step_002',
        name: 'Parse Payment Intent',
        timestamp: '2024-01-15T12:00:06Z',
        status: 'success',
        agentDecisionReason: 'Intent parsed: recurring subscription renewal',
        duration: '0.2s',
      },
      {
        id: 'step_003',
        name: 'Check Spending Limits',
        timestamp: '2024-01-15T12:00:06Z',
        status: 'success',
        agentDecisionReason: 'Daily limit: $450/$1000, Transaction: $29.99',
        duration: '0.3s',
      },
      {
        id: 'step_004',
        name: 'Execute Payment',
        timestamp: '2024-01-15T12:00:07Z',
        status: 'success',
        transactionHash: '0x8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c',
        agentDecisionReason: 'Payment routed through primary processor',
        duration: '45.2s',
      },
      {
        id: 'step_005',
        name: 'Update Subscription State',
        timestamp: '2024-01-15T12:00:52Z',
        status: 'success',
        agentDecisionReason: 'Subscription extended to 2024-02-15',
        duration: '1.1s',
      },
      {
        id: 'step_006',
        name: 'Emit Webhook Events',
        timestamp: '2024-01-15T12:00:54Z',
        status: 'success',
        agentDecisionReason: '3 webhooks dispatched: payment.success, subscription.renewed, balance.updated',
        duration: '18.4s',
      },
    ],
  },
  {
    id: 'wf_0x6e9b2d5a8c1f',
    triggerType: 'condition',
    status: 'completed',
    startedAt: '2024-01-15T11:22:33Z',
    completedAt: '2024-01-15T11:23:01Z',
    steps: [
      {
        id: 'step_001',
        name: 'Balance Threshold Alert',
        timestamp: '2024-01-15T11:22:33Z',
        status: 'success',
        agentDecisionReason: 'Hot wallet balance dropped below 1 ETH minimum',
        duration: '0.1s',
      },
      {
        id: 'step_002',
        name: 'Initiate Auto-Refill',
        timestamp: '2024-01-15T11:22:34Z',
        status: 'success',
        transactionHash: '0x9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d',
        agentDecisionReason: 'Transferring 5 ETH from cold storage',
        duration: '26.8s',
      },
    ],
  },
  {
    id: 'wf_0x4f7d1a9e3c8b',
    triggerType: 'time',
    status: 'pending',
    startedAt: '2024-01-15T15:00:00Z',
    steps: [
      {
        id: 'step_001',
        name: 'Daily Settlement Batch',
        timestamp: '2024-01-15T15:00:00Z',
        status: 'pending',
        agentDecisionReason: 'Scheduled for next execution window',
      },
    ],
  },
  {
    id: 'wf_0x1a3b5c7d9e2f',
    triggerType: 'agent',
    status: 'failed',
    startedAt: '2024-01-15T10:45:18Z',
    completedAt: '2024-01-15T10:45:21Z',
    steps: [
      {
        id: 'step_001',
        name: 'Validate Payment Request',
        timestamp: '2024-01-15T10:45:18Z',
        status: 'failed',
        errorMessage: 'INVALID_SIGNATURE: x402 header signature verification failed. Expected signer: 0x742d...8f2a, Got: 0x0000...0000',
        agentDecisionReason: 'Signature validation is mandatory for all payment requests',
        duration: '2.8s',
      },
    ],
  },
]
