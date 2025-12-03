<?php

declare(strict_types=1);

namespace X402\Payload;

use JsonSerializable;
use X402\Enum\NetworkType;
use X402\Enum\Scheme;
use X402\Exception\InvalidPayloadException;
use X402\Networks;
use X402\Value\Network;
use X402\X402;

readonly class PaymentPayload implements JsonSerializable
{
    /**
     * @param Authorization|null $authorization EVM authorization (null for SVM)
     * @param string|null $signature EVM signature (null for SVM)
     * @param string|null $transaction SVM base64-encoded transaction (null for EVM)
     */
    public function __construct(
        public Scheme $scheme,
        public Network $network,
        public ?Authorization $authorization = null,
        public ?string $signature = null,
        public ?string $transaction = null,
    ) {
    }

    public static function fromBase64(string $encoded): self
    {
        $json = base64_decode($encoded, true);
        if ($json === false) {
            throw new InvalidPayloadException('Invalid base64 encoding');
        }

        $data = json_decode($json, true);
        if (!is_array($data)) {
            throw new InvalidPayloadException('Invalid JSON in payload');
        }

        return self::fromArray($data);
    }

    /**
     * @param array<array-key, mixed> $data
     */
    public static function fromArray(array $data): self
    {
        $scheme = $data['scheme'] ?? null;
        $network = $data['network'] ?? null;
        $payload = $data['payload'] ?? null;

        if (!is_string($scheme) || !is_string($network) || !is_array($payload)) {
            throw new InvalidPayloadException('Missing required fields in payload');
        }

        $network = Networks::from($network);

        if ($network->supports(NetworkType::Solana)) {
            $transaction = $payload['transaction'] ?? null;

            if (!is_string($transaction)) {
                throw new InvalidPayloadException('Invalid SVM payload: missing transaction');
            }

            return new self(
                scheme: Scheme::from($scheme),
                network: $network,
                transaction: $transaction,
            );
        }

        // EVM payload structure
        $signature = $payload['signature'] ?? null;
        $authorization = $payload['authorization'] ?? null;

        if (!is_string($signature) || !is_array($authorization)) {
            throw new InvalidPayloadException('Invalid EVM payload structure');
        }

        return new self(
            scheme: Scheme::from($scheme),
            network: $network,
            authorization: Authorization::fromArray($authorization),
            signature: $signature,
        );
    }

    public function toBase64(): string
    {
        return $this->toArray()
            |> (fn($data): string => json_encode($data, JSON_THROW_ON_ERROR))
            |> base64_encode(...);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        $base = [
            'x402Version' => X402::VERSION,
            'scheme' => $this->scheme->value,
            'network' => $this->network->value,
        ];

        if ($this->network->supports(NetworkType::Solana)) {
            $base['payload'] = [
                'transaction' => $this->transaction,
            ];
        } else {
            $base['payload'] = [
                'signature' => $this->signature,
                'authorization' => $this->authorization?->toArray(),
            ];
        }

        return $base;
    }

    /**
     * @return array<string, mixed>
     */
    public function jsonSerialize(): array
    {
        return $this->toArray();
    }
}
