import { NextFunction, Request, Response } from "express";
import { Address, getAddress } from "viem";
import { negotiated } from "x402/schemes";
import { toJsonSafe } from "x402/shared";
import { Network, SupportedEVMNetworks } from "x402/types";

/**
 * Configuration options for negotiated payment middleware
 */
export interface NegotiatedPaymentOptions {
  strategy: negotiated.evm.PricingStrategy;
  payTo: Address;
  asset: Address;
  network: Network;
  resource?: string;
  description?: string;
}

/**
 * Creates Express middleware for negotiated pricing
 * 
 * @param options - Configuration options
 * @returns Express middleware handler
 * 
 * @example
 * ```typescript
 * import { negotiatedPayment, RangeBasedStrategy } from 'x402-express';
 * 
 * const strategy = new RangeBasedStrategy('0.10', '0.05', 3);
 * 
 * app.get('/api/data',
 *   negotiatedPayment({
 *     strategy,
 *     payTo: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb8',
 *     asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
 *     network: 'base-sepolia'
 *   }),
 *   (req, res) => {
 *     res.json({ data: 'protected content' });
 *   }
 * );
 * ```
 */
export function negotiatedPayment(options: NegotiatedPaymentOptions) {
  const { strategy, payTo, asset, network, resource, description } = options;

  if (!SupportedEVMNetworks.includes(network)) {
    throw new Error(`Unsupported network: ${network}`);
  }

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const paymentHeader = req.headers['x-payment'] as string;
    const x402Version = 1;

    const resourceUrl = resource || `${req.protocol}://${req.headers.host}${req.path}`;

    if (!paymentHeader) {
      const baseAmount = await strategy.getCurrentBasePrice(req.path);
      
      const paymentRequirements = {
        scheme: 'negotiated' as const,
        network,
        baseAmount,
        minAcceptable: baseAmount,
        maxIterations: 3,
        negotiationTimeout: 30,
        asset: getAddress(asset),
        payTo: getAddress(payTo),
        resource: resourceUrl,
        description: description || 'Protected resource',
        strategyHints: {
          volumeDiscounts: false,
          reputationAware: false,
          demandBased: false
        }
      };

      res.status(402).json({
        x402Version,
        error: 'X-PAYMENT header is required',
        accepts: toJsonSafe([paymentRequirements])
      });
      return;
    }

    try {
      const paymentData = negotiated.evm.decodeNegotiationPayment(paymentHeader);

      if (paymentData.scheme !== 'negotiated') {
        res.status(402).json({
          x402Version,
          error: 'Invalid payment scheme'
        });
        return;
      }

      const validation = negotiated.evm.validateProposal(paymentData.payload);
      if (validation !== true) {
        res.status(402).json({
          x402Version,
          error: validation
        });
        return;
      }

      const negotiationResponse = await strategy.evaluateProposal({
        proposal: paymentData.payload,
        clientAddress: paymentData.payload.proposer,
        resource: req.path
      });

      if (negotiationResponse.status === 'accepted') {
        res.locals.negotiation = negotiationResponse;
        return next();
      }

      res.status(402).json({
        x402Version,
        negotiation: negotiationResponse
      });
    } catch (error) {
      console.error('Negotiation error:', error);
      res.status(500).json({
        x402Version,
        error: 'Negotiation processing error'
      });
    }
  };
}

// Export pricing strategy types for convenience
export type PricingStrategy = negotiated.evm.PricingStrategy;
export type RangeBasedStrategy = negotiated.evm.RangeBasedStrategy;
export type VolumeBasedStrategy = negotiated.evm.VolumeBasedStrategy;

