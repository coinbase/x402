<?php

declare(strict_types=1);

namespace X402\Payload;

use JsonSerializable;
use X402\Exception\InvalidPayloadException;

readonly class Authorization implements JsonSerializable
{
    public function __construct(
        public string $from,
        public string $to,
        public string $value,
        public string $validAfter,
        public string $validBefore,
        public string $nonce,
    ) {
    }

    /**
     * @param array<array-key, mixed> $data
     */
    public static function fromArray(array $data): self
    {
        $from = $data['from'] ?? null;
        $to = $data['to'] ?? null;
        $value = $data['value'] ?? null;
        $validAfter = $data['validAfter'] ?? null;
        $validBefore = $data['validBefore'] ?? null;
        $nonce = $data['nonce'] ?? null;

        if (
            !is_string($from) || !is_string($to) || !is_string($value)
            || !is_string($validAfter) || !is_string($validBefore) || !is_string($nonce)
        ) {
            throw new InvalidPayloadException('Invalid authorization fields');
        }

        return new self(
            from: $from,
            to: $to,
            value: $value,
            validAfter: $validAfter,
            validBefore: $validBefore,
            nonce: $nonce,
        );
    }

    /**
     * @return array{from: string, to: string, value: string, validAfter: string, validBefore: string, nonce: string}
     */
    public function toArray(): array
    {
        return [
            'from' => $this->from,
            'to' => $this->to,
            'value' => $this->value,
            'validAfter' => $this->validAfter,
            'validBefore' => $this->validBefore,
            'nonce' => $this->nonce,
        ];
    }

    /**
     * @return array{from: string, to: string, value: string, validAfter: string, validBefore: string, nonce: string}
     */
    public function jsonSerialize(): array
    {
        return $this->toArray();
    }
}
