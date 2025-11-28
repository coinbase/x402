import axios from 'axios';
import { logger } from '../utils/logger';
import { getFacilitatorUrl } from '../utils/config';
import ora from 'ora';

interface DiscoverOptions {
  filter?: string;
  limit?: string;
}

export async function discoverEndpoints(options: DiscoverOptions) {
  logger.header('Discovering x402 Endpoints');

  const spinner = ora('Fetching available endpoints').start();

  try {
    const facilitatorUrl = getFacilitatorUrl();
    const limit = parseInt(options.limit || '20');

    // This endpoint structure is based on the x402 discovery example
    const response = await axios.get(`${facilitatorUrl}/list`, {
      params: {
        limit,
        ...(options.filter && { type: options.filter })
      }
    });

    spinner.succeed(`Found ${response.data.items?.length || 0} endpoints`);

    if (!response.data.items || response.data.items.length === 0) {
      logger.info('No endpoints found');
      return;
    }

    logger.header('Available Endpoints');

    response.data.items.forEach((item: any, index: number) => {
      console.log(`\n${index + 1}. ${item.resource}`);
      logger.keyValue('Type', item.type || 'unknown');
      logger.keyValue('X402 Version', item.x402Version?.toString() || 'N/A');

      if (item.metadata?.name) {
        logger.keyValue('Name', item.metadata.name);
      }

      if (item.metadata?.description) {
        logger.keyValue('Description', item.metadata.description);
      }

      if (item.accepts && item.accepts.length > 0) {
        logger.keyValue('Accepts', `${item.accepts.length} payment option(s)`);
        item.accepts.forEach((accept: any, i: number) => {
          console.log(`    ${i + 1}. ${accept.network} - ${accept.scheme}`);
        });
      }

      if (item.lastUpdated) {
        logger.keyValue('Last Updated', new Date(item.lastUpdated).toLocaleString());
      }
    });

    logger.log(`\n${logger.info('Run')} x402 info <url> ${logger.info('to see payment details for an endpoint')}`);

  } catch (error: any) {
    spinner.fail('Discovery failed');
    logger.error(error.message);

    if (error.code === 'ECONNREFUSED') {
      logger.warn('Could not connect to facilitator. Check your network or try a different facilitator URL.');
    }

    process.exit(1);
  }
}
