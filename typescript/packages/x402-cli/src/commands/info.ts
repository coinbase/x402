import axios from 'axios';
import { logger } from '../utils/logger';
import ora from 'ora';

interface InfoOptions {
  verbose?: boolean;
}

export async function getEndpointInfo(url: string, options: InfoOptions) {
  logger.header('x402 Endpoint Information');
  logger.info(`URL: ${url}`);

  const spinner = ora('Fetching payment requirements').start();

  try {
    const response = await axios.get(url, {
      validateStatus: (status) => status === 402 || status === 200
    });

    if (response.status === 200) {
      spinner.succeed('Endpoint is publicly accessible (no payment required)');
      logger.success('This endpoint does not require payment');
      return;
    }

    if (response.status !== 402) {
      spinner.warn(`Unexpected status: ${response.status}`);
      logger.warn('This endpoint may not be an x402 endpoint');
      return;
    }

    spinner.succeed('Payment requirements retrieved');

    const paymentData = response.data;

    if (options.verbose) {
      logger.header('Full Payment Requirements');
      logger.json(paymentData);
      return;
    }

    logger.header('Payment Requirements');
    logger.keyValue('x402 Version', paymentData.x402Version?.toString() || 'N/A');

    if (paymentData.error) {
      logger.error(`Server Error: ${paymentData.error}`);
    }

    if (!paymentData.accepts || paymentData.accepts.length === 0) {
      logger.warn('No payment options available');
      return;
    }

    logger.log(`\nAccepts ${paymentData.accepts.length} payment option(s):\n`);

    paymentData.accepts.forEach((requirement: any, index: number) => {
      console.log(logger.step(`Option ${index + 1}`));
      logger.keyValue('  Network', requirement.network);
      logger.keyValue('  Scheme', requirement.scheme);
      logger.keyValue('  Amount', requirement.maxAmountRequired);
      logger.keyValue('  Asset', requirement.asset);
      logger.keyValue('  Pay To', requirement.payTo);

      if (requirement.description) {
        logger.keyValue('  Description', requirement.description);
      }

      if (requirement.mimeType) {
        logger.keyValue('  Response Type', requirement.mimeType);
      }

      if (requirement.maxTimeoutSeconds) {
        logger.keyValue('  Max Timeout', `${requirement.maxTimeoutSeconds}s`);
      }

      console.log();
    });

    logger.info('Use --verbose flag to see full JSON');

  } catch (error: any) {
    spinner.fail('Request failed');
    logger.error(error.message);

    if (error.code === 'ENOTFOUND') {
      logger.warn('Could not resolve hostname. Check the URL.');
    } else if (error.code === 'ECONNREFUSED') {
      logger.warn('Connection refused. Is the server running?');
    }

    if (options.verbose && error.response) {
      logger.json(error.response.data);
    }

    process.exit(1);
  }
}
