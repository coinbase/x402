<?php

declare(strict_types=1);

namespace X402;

use GuzzleHttp\Client;
use X402\Http\FacilitatorClient;
use X402\Payload\PaymentPayload;
use X402\Payload\PaymentRequirements;
use X402\Payload\SettleResponse;
use X402\Payload\VerifyResponse;

final readonly class Facilitator implements FacilitatorInterface
{
    public const string DEFAULT_URL = FacilitatorClient::DEFAULT_URL;

    private FacilitatorClient $client;

    public function __construct(?FacilitatorClient $client = null, string $baseUrl = self::DEFAULT_URL)
    {
        $this->client = $client ?? new FacilitatorClient(baseUrl: $baseUrl);
    }

    public static function create(?Client $guzzle = null, string $baseUrl = self::DEFAULT_URL): self
    {
        return new self(new FacilitatorClient($guzzle ?? new Client(['timeout' => 30]), $baseUrl));
    }

    public function verify(PaymentPayload $payment, PaymentRequirements $requirements): VerifyResponse
    {
        return $this->client->verify($payment, $requirements);
    }

    public function settle(PaymentPayload $payment, PaymentRequirements $requirements): SettleResponse
    {
        return $this->client->settle($payment, $requirements);
    }

    /**
     * @return array<string, mixed>
     */
    public function supported(): array
    {
        return $this->client->supported();
    }
}
