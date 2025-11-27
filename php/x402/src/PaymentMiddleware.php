<?php

declare(strict_types=1);

namespace X402;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use X402\Enum\Scheme;
use X402\Exception\InvalidPayloadException;
use X402\Exception\SettlementFailedException;
use X402\Exception\VerificationFailedException;
use X402\Payload\PaymentPayload;
use X402\Payload\PaymentRequirements;
use X402\Payload\PaymentRequirementsResponse;
use X402\Paywall\Paywall;
use X402\Value\Amount;
use X402\Value\Network;

final readonly class PaymentMiddleware implements MiddlewareInterface
{
    private const string DEFAULT_NETWORK = 'base-sepolia';
    private Network $network;
    private ?Paywall $paywall;

    /**
     * @param array{
     *     cdp_client_key?: string,
     *     app_name?: string,
     *     app_logo?: string,
     *     session_token_endpoint?: string,
     * }|null $paywallConfig Paywall configuration for browser requests (null to disable)
     */
    public function __construct(
        private string $payTo,
        private string $price,
        private Facilitator $facilitator = new Facilitator(),
        Network|string|null $network = null,
        private string $description = '',
        ?array $paywallConfig = [],
    ) {
        $this->network = $this->resolveNetwork($network);
        $this->paywall = $paywallConfig !== null ? new Paywall($paywallConfig) : null;
    }

    private function resolveNetwork(Network|string|null $network): Network
    {
        return match (true) {
            $network instanceof Network => $network,
            is_string($network) => Networks::from($network),
            default => Networks::from(self::DEFAULT_NETWORK),
        };
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $requirements = new PaymentRequirements(
            scheme: Scheme::Exact,
            network: $this->network,
            maxAmountRequired: Amount::fromDecimal($this->price),
            resource: (string) $request->getUri(),
            payTo: $this->payTo,
            asset: $this->network->address,
            description: $this->description,
            extra: [
                'name' => $this->network->name,
                'version' => $this->network->version,
            ],
        );

        $paymentHeader = $request->getHeaderLine('X-PAYMENT');

        if ($paymentHeader === '' || $paymentHeader === '0') {
            return $this->paymentRequiredResponse($request, $handler, 'X-PAYMENT header required', $requirements);
        }

        try {
            $payment = PaymentPayload::fromBase64($paymentHeader);
        } catch (InvalidPayloadException $e) {
            return $this->paymentRequiredResponse($request, $handler, $e->getMessage(), $requirements);
        }

        if ($payment->network->value !== $requirements->network->value) {
            return $this->paymentRequiredResponse(
                $request,
                $handler,
                'Payment does not match requirements',
                $requirements
            );
        }

        try {
            $verifyResponse = $this->facilitator->verify($payment, $requirements);
        } catch (VerificationFailedException $e) {
            return $this->paymentRequiredResponse($request, $handler, $e->reason, $requirements);
        }

        $request = $request
            ->withAttribute('x402.requirements', $requirements)
            ->withAttribute('x402.payer', $verifyResponse->payer);

        $response = $handler->handle($request);

        if ($response->getStatusCode() < 200 || $response->getStatusCode() >= 300) {
            return $response;
        }

        try {
            $settleResponse = $this->facilitator->settle($payment, $requirements);
        } catch (SettlementFailedException $e) {
            return $this->paymentRequiredResponse($request, $handler, $e->reason, $requirements);
        }

        return $response->withHeader('X-PAYMENT-RESPONSE', $settleResponse->toBase64());
    }

    private function paymentRequiredResponse(
        ServerRequestInterface $request,
        RequestHandlerInterface $handler,
        string $error,
        PaymentRequirements $requirements,
    ): ResponseInterface {
        $response = $handler->handle($request->withAttribute('x402.bypass', true));

        // Return HTML paywall for browser requests
        if ($this->paywall instanceof Paywall && Paywall::isBrowserRequest($this->getHeaders($request))) {
            $html = $this->paywall->getPaywallHtml($error, [$requirements]);

            return $response
                ->withStatus(402)
                ->withHeader('Content-Type', 'text/html; charset=utf-8')
                ->withBody(\GuzzleHttp\Psr7\Utils::streamFor($html));
        }

        // Return JSON for API clients
        $paymentResponse = new PaymentRequirementsResponse(
            error: $error,
            accepts: [$requirements],
        );

        return $response
            ->withStatus(402)
            ->withHeader('Content-Type', 'application/json')
            ->withBody(\GuzzleHttp\Psr7\Utils::streamFor(json_encode($paymentResponse)));
    }

    /**
     * Extract headers from PSR-7 request as simple key-value array.
     *
     * @return array<string, string>
     */
    private function getHeaders(ServerRequestInterface $request): array
    {
        $headers = [];
        foreach ($request->getHeaders() as $name => $values) {
            $headers[$name] = implode(', ', $values);
        }

        return $headers;
    }
}
