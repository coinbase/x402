import { createPaymentHandler } from '@x402/next';
import type { NextApiRequest, NextApiResponse } from 'next';

// Mock weather data
const weatherData = {
  location: 'San Francisco, CA',
  temperature: '72°F',
  condition: 'Sunny',
  humidity: '45%',
  windSpeed: '8 mph',
  forecast: [
    { day: 'Today', high: '75°F', low: '60°F', condition: 'Sunny' },
    { day: 'Tomorrow', high: '73°F', low: '58°F', condition: 'Partly Cloudy' },
    { day: 'Wednesday', high: '70°F', low: '55°F', condition: 'Cloudy' }
  ]
};

const handler = createPaymentHandler({
  accepts: [
    {
      scheme: 'exact',
      network: 'eip155:8453', // Base
      price: '$0.01',
      payTo: '0x1234567890123456789012345678901234567890',
      extra: {
        assetTransferMethod: 'eip3009'
      }
    },
    {
      scheme: 'exact', 
      network: 'eip155:1', // Ethereum
      price: '$0.01',
      payTo: '0x1234567890123456789012345678901234567890',
      extra: {
        assetTransferMethod: 'eip3009'
      }
    }
  ],
  description: 'Current weather data and 3-day forecast'
}, async (req: NextApiRequest, res: NextApiResponse) => {
  // This handler only runs after payment is verified
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Optional: Add some processing delay to demonstrate value
  await new Promise(resolve => setTimeout(resolve, 100));
  
  res.status(200).json({
    success: true,
    data: weatherData,
    timestamp: new Date().toISOString()
  });
});

export default handler;