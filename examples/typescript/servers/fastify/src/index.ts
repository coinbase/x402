import { config } from 'dotenv';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import x402Plugin from './x402-plugin.js';

// Load environment variables
config();

const evmAddress = process.env.EVM_ADDRESS as `0x${string}`;
const svmAddress = process.env.SVM_ADDRESS;
if (!evmAddress || !svmAddress) {
  console.error('❌ Missing required environment variables: EVM_ADDRESS and SVM_ADDRESS');
  process.exit(1);
}

const facilitatorUrl = process.env.FACILITATOR_URL;
if (!facilitatorUrl) {
  console.error('❌ FACILITATOR_URL environment variable is required');
  process.exit(1);
}

// Create Fastify instance
const fastify = Fastify({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty'
    }
  }
});

// Register CORS plugin
await fastify.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x402-payment', 'x402-request-id']
});

// Register x402 plugin with resource configuration
await fastify.register(x402Plugin, {
  facilitatorUrl,
  resources: {
    'GET /weather': {
      accepts: [
        {
          scheme: 'exact',
          price: '$0.001',
          network: 'eip155:84532',
          payTo: evmAddress,
        },
        {
          scheme: 'exact',
          price: '$0.001',
          network: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
          payTo: svmAddress,
        },
      ],
      description: 'Current weather data with temperature and conditions',
      mimeType: 'application/json',
    },
    'GET /quote': {
      accepts: [
        {
          scheme: 'exact',
          price: '$0.005',
          network: 'eip155:84532',
          payTo: evmAddress,
        },
      ],
      description: 'Daily inspirational quote',
      mimeType: 'application/json',
    },
  }
});

// Protected routes - x402 payment required
fastify.get('/weather', {
  preHandler: fastify.x402.authenticate
}, async () => {
  return {
    location: 'San Francisco, CA',
    temperature: 72,
    condition: 'Sunny',
    humidity: 65,
    windSpeed: 8,
    timestamp: new Date().toISOString()
  };
});

fastify.get('/quote', {
  preHandler: fastify.x402.authenticate
}, async () => {
  const quotes = [
    'The future belongs to those who believe in the beauty of their dreams.',
    'Innovation distinguishes between a leader and a follower.',
    'The best time to plant a tree was 20 years ago. The second best time is now.',
    'Your limitation—it\'s only your imagination.',
    'Great things never come from comfort zones.'
  ];
  
  const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
  
  return {
    quote: randomQuote,
    author: 'Daily Inspiration',
    timestamp: new Date().toISOString()
  };
});

// Free routes - no payment required
fastify.get('/health', async () => {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  };
});

fastify.get('/', async () => {
  return {
    message: 'Fastify x402 Server Example',
    endpoints: {
      '/weather': 'Weather data (payment required)',
      '/quote': 'Daily quote (payment required)',
      '/health': 'Health check (free)',
      '/.well-known/x402': 'x402 discovery document (free)'
    },
    paymentInfo: {
      protocol: 'x402 v2',
      networks: ['Base Sepolia (eip155:84532)', 'Solana Devnet'],
      schemes: ['exact'],
      pricing: 'Weather: $0.001, Quote: $0.005'
    }
  };
});

// Error handler
fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error(error);
  
  if (error.statusCode === 402) {
    return reply.status(402).send({
      error: 'Payment Required',
      message: 'This endpoint requires x402 payment',
      ...error.payload
    });
  }
  
  reply.status(error.statusCode || 500).send({
    error: error.name || 'Internal Server Error',
    message: error.message
  });
});

// Start server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '4022');
    const host = process.env.HOST || '0.0.0.0';
    
    await fastify.listen({ port, host });
    
    console.log('🚀 Fastify x402 server started successfully!');
    console.log(`📍 Server listening at http://${host}:${port}`);
    console.log('💰 Payment-protected endpoints: /weather, /quote');
    console.log('🆓 Free endpoints: /, /health, /.well-known/x402');
    console.log('🔍 Discovery: http://localhost:4022/.well-known/x402');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();