<?php

declare(strict_types=1);

namespace X402\Payload;

use X402\Exception\InvalidPayloadException;

readonly class VerifyResponse
{
    public function __construct(
        public bool $isValid,
        public ?string $invalidReason = null,
        public ?string $payer = null,
    ) {
    }

    /**
     * @param array<string, mixed> $data
     */
    public static function fromArray(array $data): self
    {
        $isValid = $data['isValid'] ?? null;
        $invalidReason = $data['invalidReason'] ?? null;
        $payer = $data['payer'] ?? null;

        if (!is_bool($isValid)) {
            throw new InvalidPayloadException('Invalid verify response: isValid must be bool');
        }

        if ($invalidReason !== null && !is_string($invalidReason)) {
            throw new InvalidPayloadException('Invalid verify response: invalidReason must be string');
        }

        if ($payer !== null && !is_string($payer)) {
            throw new InvalidPayloadException('Invalid verify response: payer must be string');
        }

        return new self(
            isValid: $isValid,
            invalidReason: $invalidReason,
            payer: $payer,
        );
    }
}
