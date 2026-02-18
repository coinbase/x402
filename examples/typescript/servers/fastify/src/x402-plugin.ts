import fp from 'fastify-plugin';
import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { 
  x402ResourceServer, 
  HTTPFacilitatorClient, 
  ResourceConfig,
  buildPaymentRequirements
} from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { ExactSvmScheme } from '@x402/svm/exact/server';

interface X402Options {
  facilitatorUrl: string;
  resources: Record<string, ResourceConfig>;
}

interface X402Instance {
  resourceServer: x402ResourceServer;
  authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<boolean>;
}

declare module 'fastify' {
  interface FastifyInstance {
    x402: X402Instance;
  }
}

const x402Plugin: FastifyPluginAsync<X402Options> = async (fastify, options) => {
  const facilitatorClient = new HTTPFacilitatorClient({ 
    url: options.facilitatorUrl 
  });

  const resourceServer = new x402ResourceServer(facilitatorClient)
    .register('eip155:84532', new ExactEvmScheme())
    .register('solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1', new ExactSvmScheme());

  // Store resource configurations
  const resources = options.resources;

  const authenticate = async (request: FastifyRequest, reply: FastifyReply): Promise<boolean> => {
    const method = request.method;
    const path = request.url.split('?')[0];
    const routeKey = `${method} ${path}`;
    
    const resourceConfig = resources[routeKey];
    if (!resourceConfig) {
      // No payment required for this route
      return true;
    }

    try {
      // Check for payment headers
      const paymentHeader = request.headers['x402-payment'] as string | undefined;
      const authHeader = request.headers['authorization'] as string | undefined;

      if (!paymentHeader && !authHeader) {
        // No payment provided, return 402 with payment requirements
        const paymentRequirements = buildPaymentRequirements(resourceConfig);
        
        reply.status(402);
        reply.header('www-authenticate', 'x402');
        reply.header('content-type', 'application/json');
        
        reply.send({
          error: 'Payment Required',
          message: 'This endpoint requires x402 payment',
          x402Version: '2',
          ...paymentRequirements
        });
        
        return false;
      }

      // Verify payment (simplified for example)
      // In production, you'd verify the payment with the facilitator
      fastify.log.info(`Payment verification for ${routeKey}: ${paymentHeader || authHeader}`);
      
      return true;

    } catch (error) {
      fastify.log.error(error);
      reply.status(500).send({ error: 'Payment verification failed' });
      return false;
    }
  };

  // Register the x402 instance
  fastify.decorate('x402', { resourceServer, authenticate });

  // Add discovery endpoint
  fastify.get('/.well-known/x402', async () => {
    return {
      x402Version: '2',
      discoveryDocument: {
        resources: Object.fromEntries(
          Object.entries(resources).map(([route, config]) => {
            const path = route.replace(/^[A-Z]+ /, '');
            return [path, {
              accepts: config.accepts,
              description: config.description
            }];
          })
        )
      }
    };
  });
};

export default fp(x402Plugin, {
  name: 'x402',
  fastify: '5.x'
});