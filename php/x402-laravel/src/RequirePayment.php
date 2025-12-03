<?php

declare(strict_types=1);

namespace X402\Laravel;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response as IlluminateResponse;
use Symfony\Component\HttpFoundation\Response;
use X402\Enum\Scheme;
use X402\Exception\InvalidPayloadException;
use X402\Exception\SettlementFailedException;
use X402\Exception\VerificationFailedException;
use X402\FacilitatorInterface;
use X402\Laravel\Events\PaymentFailed;
use X402\Laravel\Events\PaymentSettled;
use X402\Laravel\Events\PaymentVerified;
use X402\Laravel\Exceptions\MissingConfigurationException;
use X402\Networks;
use X402\Payload\PaymentPayload;
use X402\Payload\PaymentRequirements;
use X402\Payload\PaymentRequirementsResponse;
use X402\Paywall\Paywall;
use X402\Value\Amount;

class RequirePayment
{
    private const string DEFAULT_NETWORK = 'base-sepolia';

    public function __construct(
        private readonly FacilitatorInterface $facilitator,
    ) {
    }

    /**
     * Create a middleware string with options array.
     *
     * @param array{pay_to?: string, network?: string, description?: string} $options
     */
    public static function with(string $price, array $options = []): string
    {
        $pending = PendingPayment::make($price);

        if (!empty($options['pay_to'])) {
            $pending->payTo($options['pay_to']);
        }

        if (!empty($options['network'])) {
            $pending->network($options['network']);
        }

        if (!empty($options['description'])) {
            $pending->description($options['description']);
        }

        return $pending->__toString();
    }

    public static function for(string $price): PendingPayment
    {
        return PendingPayment::make($price);
    }

    public function handle(
        Request $request,
        Closure $next,
        string $priceOrEncoded,
        ?string $payTo = null,
        ?string $network = null,
    ): Response {
        // Check if this is a base64-encoded options object (from PendingPayment)
        $options = $this->parseMiddlewareParams($priceOrEncoded, $payTo, $network);

        $price = $options['price'];
        $payTo = $options['pay_to'] ?? config('x402.pay_to');
        $network = $options['network'] ?? config('x402.network', self::DEFAULT_NETWORK);
        $description = $options['description'] ?? config('x402.description');

        if (!$payTo || !is_string($payTo)) {
            throw new MissingConfigurationException('pay_to');
        }

        $networkObj = Networks::from($network);
        $extra = $this->buildExtra($networkObj, $description);

        $requirements = new PaymentRequirements(
            scheme: Scheme::Exact,
            network: $networkObj,
            maxAmountRequired: Amount::fromDecimal($price),
            resource: $request->fullUrl(),
            payTo: $payTo,
            asset: $networkObj->address,
            extra: $extra,
        );

        $paymentHeader = $request->header('X-PAYMENT');

        if (!$paymentHeader || !is_string($paymentHeader)) {
            return $this->paymentRequired($request, 'X-PAYMENT header required', $requirements);
        }

        try {
            $payment = PaymentPayload::fromBase64($paymentHeader);
        } catch (InvalidPayloadException $e) {
            return $this->paymentRequired($request, $e->getMessage(), $requirements);
        }

        if ($payment->network->value !== $requirements->network->value) {
            return $this->paymentRequired($request, 'Payment does not match requirements', $requirements);
        }

        try {
            $verifyResponse = $this->facilitator->verify($payment, $requirements);
        } catch (VerificationFailedException $e) {
            PaymentFailed::dispatch($e->reason, $requirements, $payment);

            return $this->paymentRequired($request, $e->reason, $requirements);
        }

        PaymentVerified::dispatch($verifyResponse->payer, $payment, $requirements);

        $request->attributes->set('x402.requirements', $requirements);
        $request->attributes->set('x402.payer', $verifyResponse->payer);

        /** @var Response $response */
        $response = $next($request);

        if (!$response->isSuccessful()) {
            return $response;
        }

        try {
            $settleResponse = $this->facilitator->settle($payment, $requirements);
        } catch (SettlementFailedException $e) {
            PaymentFailed::dispatch($e->reason, $requirements, $payment, $verifyResponse->payer);

            return $this->paymentRequired($request, $e->reason, $requirements);
        }

        PaymentSettled::dispatch($verifyResponse->payer, $payment, $requirements, $settleResponse);

        $response->headers->set('X-PAYMENT-RESPONSE', $settleResponse->toBase64());

        return $response;
    }

    /**
     * @return array{price: string, pay_to?: string, network?: string, description?: string}
     */
    private function parseMiddlewareParams(string $priceOrEncoded, ?string $payTo, ?string $network): array
    {
        // If payTo or network are provided, this is the old comma-separated style
        if ($payTo !== null || $network !== null) {
            $options = ['price' => $priceOrEncoded];

            if (filled($payTo)) {
                $options['pay_to'] = $payTo;
            }

            if (filled($network)) {
                $options['network'] = $network;
            }

            return $options;
        }

        // Try to decode as base64 JSON (new style from PendingPayment)
        $decoded = base64_decode($priceOrEncoded, true);
        if ($decoded !== false) {
            $json = json_decode($decoded, true);
            if (is_array($json) && isset($json['price'])) {
                return $json;
            }
        }

        // Fall back to treating it as just a price (simple usage)
        return ['price' => $priceOrEncoded];
    }

    private function paymentRequired(Request $request, string $error, PaymentRequirements $requirements): Response
    {
        PaymentFailed::dispatch($error, $requirements);

        // Return HTML paywall for browser requests if enabled
        if ($this->shouldShowPaywall($request)) {
            $paywall = new Paywall($this->getPaywallConfig());
            $html = $paywall->getPaywallHtml($error, [$requirements]);

            return new IlluminateResponse($html, 402, [
                'Content-Type' => 'text/html; charset=utf-8',
            ]);
        }

        // Return JSON for API clients
        $response = new PaymentRequirementsResponse(
            error: $error,
            accepts: [$requirements],
        );

        return new JsonResponse($response, 402);
    }

    private function shouldShowPaywall(Request $request): bool
    {
        if (!config('x402.paywall.enabled', true)) {
            return false;
        }

        /** @var array<string, string|string[]> $headers */
        $headers = $request->headers->all();

        return Paywall::isBrowserRequest($headers);
    }

    /**
     * @return array{
     *     cdp_client_key?: string,
     *     app_name?: string,
     *     app_logo?: string,
     *     session_token_endpoint?: string,
     * }
     */
    private function getPaywallConfig(): array
    {
        return [
            'cdp_client_key' => config('x402.paywall.cdp_client_key', ''),
            'app_name' => config('x402.paywall.app_name', config('app.name', '')),
            'app_logo' => config('x402.paywall.app_logo', ''),
            'session_token_endpoint' => config('x402.paywall.session_token_endpoint', ''),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function buildExtra(\X402\Value\Network $network, ?string $description = null): array
    {
        $extra = [
            'name' => $network->name,
            'version' => $network->version,
        ];

        if ($description) {
            $extra['description'] = $description;
        }

        if (!str_starts_with($network->value, 'solana')) {
            return $extra;
        }

        $feePayer = $this->getSolanaFeePayer($network->value);

        if (!$feePayer) {
            throw new \RuntimeException("x402: facilitator did not provide a feePayer for network: {$network->value}");
        }

        $extra['feePayer'] = $feePayer;

        return $extra;
    }

    private function getSolanaFeePayer(string $network): ?string
    {
        $supported = $this->facilitator->supported();
        /** @var array<int, array<string, mixed>> $kinds */
        $kinds = data_get($supported, 'kinds', []);

        foreach ($kinds as $kind) {
            $matchesNetwork = data_get($kind, 'network') === $network;
            $matchesScheme = data_get($kind, 'scheme') === Scheme::Exact->value;

            if ($matchesNetwork && $matchesScheme) {
                $feePayer = data_get($kind, 'extra.feePayer');

                return is_string($feePayer) ? $feePayer : null;
            }
        }

        return null;
    }
}
