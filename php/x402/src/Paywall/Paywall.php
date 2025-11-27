<?php

declare(strict_types=1);

namespace X402\Paywall;

use X402\Payload\PaymentRequirements;
use X402\X402;

use function X402\Paywall\PAYWALL_TEMPLATE;

final class Paywall
{
    private const string X402_VERSION = '0.1.0';

    /**
     * @param array{
     *     cdp_client_key?: string,
     *     app_name?: string,
     *     app_logo?: string,
     *     session_token_endpoint?: string,
     * } $config
     */
    public function __construct(
        /**
         * Configuration options for the paywall UI.
         */
        private array $config = []
    ) {
    }

    /**
     * Determine if request is from a browser vs API client.
     *
     * @param array<string, string|string[]> $headers Request headers (case-insensitive)
     */
    public static function isBrowserRequest(array $headers): bool
    {
        $headersLower = [];
        foreach ($headers as $key => $value) {
            $headersLower[strtolower($key)] = is_array($value) ? implode(', ', $value) : $value;
        }

        $acceptHeader = $headersLower['accept'] ?? '';
        $userAgent = $headersLower['user-agent'] ?? '';

        return str_contains($acceptHeader, 'text/html') && str_contains($userAgent, 'Mozilla');
    }

    /**
     * Get the paywall HTML with payment data injected.
     *
     * @param string $error Error message to display
     * @param PaymentRequirements[] $paymentRequirements List of payment requirements
     */
    public function getPaywallHtml(string $error, array $paymentRequirements): string
    {
        require_once __DIR__ . '/template.php';

        $html = PAYWALL_TEMPLATE;

        return $this->injectPaymentData($html, $error, $paymentRequirements);
    }

    /**
     * Inject payment requirements into HTML as JavaScript variables.
     *
     * @param PaymentRequirements[] $paymentRequirements
     */
    private function injectPaymentData(string $htmlContent, string $error, array $paymentRequirements): string
    {
        $x402Config = $this->createX402Config($error, $paymentRequirements);

        $logOnTestnet = $x402Config['testnet']
            ? "console.log('Payment requirements initialized:', window.x402);"
            : '';

        $configScript = sprintf(
            '
  <script>
    window.x402 = %s;
    %s
  </script>',
            json_encode($x402Config, JSON_UNESCAPED_SLASHES),
            $logOnTestnet
        );

        return str_replace('</head>', $configScript . "\n</head>", $htmlContent);
    }

    /**
     * Create x402 configuration object from payment requirements.
     *
     * @param PaymentRequirements[] $paymentRequirements
     * @return array<string, mixed>
     */
    private function createX402Config(string $error, array $paymentRequirements): array
    {
        $requirements = $paymentRequirements[0] ?? null;
        $displayAmount = 0.0;
        $currentUrl = '';
        $testnet = true;

        if ($requirements !== null) {
            // Convert atomic amount back to USD (assuming USDC with 6 decimals)
            $displayAmount = (float) $requirements->maxAmountRequired->toDecimal();

            $currentUrl = $requirements->resource;
            $testnet = $requirements->network->value === 'base-sepolia';
        }

        return [
            'amount' => $displayAmount,
            'paymentRequirements' => array_map(
                fn(PaymentRequirements $req): array => $req->toArray(),
                $paymentRequirements
            ),
            'testnet' => $testnet,
            'currentUrl' => $currentUrl,
            'error' => $error,
            'x402_version' => self::X402_VERSION,
            'cdpClientKey' => $this->config['cdp_client_key'] ?? '',
            'appName' => $this->config['app_name'] ?? '',
            'appLogo' => $this->config['app_logo'] ?? '',
            'sessionTokenEndpoint' => $this->config['session_token_endpoint'] ?? '',
        ];
    }
}
