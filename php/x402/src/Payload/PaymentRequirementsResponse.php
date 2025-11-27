<?php

declare(strict_types=1);

namespace X402\Payload;

use JsonSerializable;
use X402\X402;

readonly class PaymentRequirementsResponse implements JsonSerializable
{
    public int $x402Version;

    /**
     * @param PaymentRequirements[] $accepts
     */
    public function __construct(
        public string $error,
        public array $accepts,
        ?int $x402Version = null,
    ) {
        $this->x402Version = $x402Version ?? X402::VERSION;
    }

    /**
     * @return array{x402Version: int, error: string, accepts: array<int, array<string, mixed>>}
     */
    public function toArray(): array
    {
        return [
            'x402Version' => $this->x402Version,
            'error' => $this->error,
            'accepts' => $this->accepts
                |> (fn($arr): array => array_map(fn(PaymentRequirements $r): array => $r->toArray(), $arr))
                |> array_values(...),
        ];
    }

    /**
     * @return array{x402Version: int, error: string, accepts: array<int, array<string, mixed>>}
     */
    public function jsonSerialize(): array
    {
        return $this->toArray();
    }
}
