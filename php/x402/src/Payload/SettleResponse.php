<?php

declare(strict_types=1);

namespace X402\Payload;

use JsonSerializable;
use X402\Exception\InvalidPayloadException;

readonly class SettleResponse implements JsonSerializable
{
    public function __construct(
        public bool $success,
        public ?string $errorReason = null,
        public ?string $transaction = null,
        public ?string $network = null,
        public ?string $payer = null,
    ) {
    }

    /**
     * @param array<string, mixed> $data
     */
    public static function fromArray(array $data): self
    {
        $success = $data['success'] ?? null;
        $errorReason = $data['errorReason'] ?? null;
        $transaction = $data['transaction'] ?? null;
        $network = $data['network'] ?? null;
        $payer = $data['payer'] ?? null;

        if (!is_bool($success)) {
            throw new InvalidPayloadException('Invalid settle response: success must be bool');
        }

        if ($errorReason !== null && !is_string($errorReason)) {
            throw new InvalidPayloadException('Invalid settle response: errorReason must be string');
        }

        if ($transaction !== null && !is_string($transaction)) {
            throw new InvalidPayloadException('Invalid settle response: transaction must be string');
        }

        if ($network !== null && !is_string($network)) {
            throw new InvalidPayloadException('Invalid settle response: network must be string');
        }

        if ($payer !== null && !is_string($payer)) {
            throw new InvalidPayloadException('Invalid settle response: payer must be string');
        }

        return new self(
            success: $success,
            errorReason: $errorReason,
            transaction: $transaction,
            network: $network,
            payer: $payer,
        );
    }

    public function toBase64(): string
    {
        return $this->toArray()
            |> (fn($data): string => json_encode($data, JSON_THROW_ON_ERROR))
            |> base64_encode(...);
    }

    /**
     * @return array{success: bool, errorReason?: string, transaction?: string, network?: string, payer?: string}
     */
    public function toArray(): array
    {
        $data = ['success' => $this->success];

        if ($this->errorReason !== null) {
            $data['errorReason'] = $this->errorReason;
        }
        if ($this->transaction !== null) {
            $data['transaction'] = $this->transaction;
        }
        if ($this->network !== null) {
            $data['network'] = $this->network;
        }
        if ($this->payer !== null) {
            $data['payer'] = $this->payer;
        }

        return $data;
    }

    /**
     * @return array{success: bool, errorReason?: string, transaction?: string, network?: string, payer?: string}
     */
    public function jsonSerialize(): array
    {
        return $this->toArray();
    }
}
