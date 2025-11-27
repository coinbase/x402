<?php

declare(strict_types=1);

namespace X402\Http;

use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;
use X402\Exception\SettlementFailedException;
use X402\Exception\VerificationFailedException;
use X402\Exception\X402Exception;
use X402\Payload\PaymentPayload;
use X402\Payload\PaymentRequirements;
use X402\Payload\SettleResponse;
use X402\Payload\VerifyResponse;
use X402\X402;

final readonly class FacilitatorClient
{
    public const string DEFAULT_URL = 'https://x402.org/facilitator';
    private string $baseUrl;

    public function __construct(
        private Client $client = new Client(['timeout' => 30]),
        string $baseUrl = self::DEFAULT_URL
    ) {
        $this->baseUrl = rtrim($baseUrl, '/');
    }

    public function verify(PaymentPayload $payment, PaymentRequirements $requirements): VerifyResponse
    {
        $data = $this->postJson('/verify', [
            'x402Version' => X402::VERSION,
            'paymentPayload' => $payment->toArray(),
            'paymentRequirements' => $requirements->toArray(),
        ]);

        $response = VerifyResponse::fromArray($data);

        if (!$response->isValid) {
            throw new VerificationFailedException(
                $response->invalidReason ?? 'Unknown error',
                $response->payer,
            );
        }

        return $response;
    }

    public function settle(PaymentPayload $payment, PaymentRequirements $requirements): SettleResponse
    {
        $data = $this->postJson('/settle', [
            'x402Version' => X402::VERSION,
            'paymentPayload' => $payment->toArray(),
            'paymentRequirements' => $requirements->toArray(),
        ]);

        $response = SettleResponse::fromArray($data);

        if (!$response->success) {
            throw new SettlementFailedException($response->errorReason ?? 'Unknown error');
        }

        return $response;
    }

    /**
     * @return array<string, mixed>
     */
    public function supported(): array
    {
        return $this->getJson('/supported');
    }

    /**
     * @param array<string, mixed> $body
     * @return array<string, mixed>
     */
    private function postJson(string $path, array $body): array
    {
        try {
            $response = $this->client->post($this->baseUrl . $path, [
                'json' => $body,
            ]);

            $decoded = json_decode($response->getBody()->getContents(), true);
            if (!is_array($decoded)) {
                throw new X402Exception('Invalid JSON response');
            }
            /** @var array<string, mixed> $decoded */
            return $decoded;
        } catch (GuzzleException $e) {
            throw new X402Exception("HTTP request failed: {$e->getMessage()}", 0, $e);
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function getJson(string $path): array
    {
        try {
            $response = $this->client->get($this->baseUrl . $path);

            $decoded = json_decode($response->getBody()->getContents(), true);
            if (!is_array($decoded)) {
                throw new X402Exception('Invalid JSON response');
            }
            /** @var array<string, mixed> $decoded */
            return $decoded;
        } catch (GuzzleException $e) {
            throw new X402Exception("HTTP request failed: {$e->getMessage()}", 0, $e);
        }
    }
}
