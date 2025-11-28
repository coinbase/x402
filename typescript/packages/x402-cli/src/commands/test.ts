import axios from 'axios';
import { logger } from '../utils/logger';
import { getPrivateKey } from '../utils/config';
import ora from 'ora';

interface TestOptions {
  key?: string;
  amount?: string;
  verbose?: boolean;
}

export async function testEndpoint(url: string, options: TestOptions) {
  logger.header('Testing x402 Endpoint');
  logger.info(`Target: ${url}`);

  const spinner = ora();

  try {
    const privateKey = getPrivateKey(options.key);
    if (!privateKey) {
      logger.error('Private key required. Use --key flag or set X402_PRIVATE_KEY env var');
      process.exit(1);
    }

    spinner.start('Making initial request to get payment requirements');

    const initialResponse = await axios.get(url, {
      validateStatus: (status) => status === 402 || status === 200
    });

    if (initialResponse.status === 200) {
      spinner.succeed('Endpoint is publicly accessible (no payment required)');
      logger.success('Response received');
      if (options.verbose) {
        logger.json(initialResponse.data);
      }
      return;
    }

    if (initialResponse.status !== 402) {
      spinner.fail(`Unexpected status code: ${initialResponse.status}`);
      return;
    }

    spinner.succeed('Received payment requirements (402)');

    const paymentRequirements = initialResponse.data;

    if (options.verbose) {
      logger.header('Payment Requirements');
      logger.json(paymentRequirements);
    }

    if (!paymentRequirements.accepts || paymentRequirements.accepts.length === 0) {
      logger.error('No payment options available');
      return;
    }

    const selectedRequirement = paymentRequirements.accepts[0];

    logger.step('Payment Details:');
    logger.keyValue('Amount', `${selectedRequirement.maxAmountRequired} (${selectedRequirement.asset})`);
    logger.keyValue('Network', selectedRequirement.network);
    logger.keyValue('Scheme', selectedRequirement.scheme);
    logger.keyValue('Pay To', selectedRequirement.payTo);

    spinner.start('Creating payment signature');

    // Note: Actual payment creation would use x402 SDK here
    // This is a placeholder showing the flow
    spinner.info('Payment creation requires x402 SDK integration');
    logger.warn('Full payment flow not yet implemented - this is a demo showing the structure');

    logger.header('Next Steps');
    logger.log('To complete the payment flow, integrate with:');
    logger.log('  - x402 package for payment creation');
    logger.log('  - x402-axios for automatic payment handling');
    logger.log('  - Wallet for signing transactions');

  } catch (error: any) {
    spinner.fail('Request failed');
    logger.error(error.message);
    if (options.verbose && error.response) {
      logger.json(error.response.data);
    }
    process.exit(1);
  }
}
