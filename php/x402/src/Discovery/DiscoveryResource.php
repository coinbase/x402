<?php

declare(strict_types=1);

namespace X402\Discovery;

use JsonSerializable;
use X402\Payload\PaymentRequirements;

readonly class DiscoveryResource implements JsonSerializable
{
    /**
     * @param PaymentRequirements[] $accepts
     * @param array<string, mixed>|null $metadata
     */
    public function __construct(
        public string $resource,
        public string $type,
        public array $accepts,
        public int $lastUpdated,
        public ?array $metadata = null,
        public int $x402Version = 1,
    ) {
    }

    /**
     * @return array{
     *  resource: string,
     *  type: string,
     *  x402Version: int,
     *  accepts: array<int, array<string, mixed>>,
     *  lastUpdated: int,
     *  metadata?: array<string, mixed>
     * }
     */
    public function toArray(): array
    {
        $data = [
            'resource' => $this->resource,
            'type' => $this->type,
            'x402Version' => $this->x402Version,
            'accepts' => $this->accepts
                |> (fn($arr): array => array_map(fn(PaymentRequirements $r): array => $r->toArray(), $arr))
                |> array_values(...),
            'lastUpdated' => $this->lastUpdated,
        ];

        if ($this->metadata !== null) {
            $data['metadata'] = $this->metadata;
        }

        return $data;
    }

    /**
     * @return array{
     *  resource: string,
     *  type: string,
     *  x402Version: int,
     *  accepts: array<int, array<string, mixed>>,
     *  lastUpdated: int,
     *  metadata?: array<string, mixed>
     * }
     */
    public function jsonSerialize(): array
    {
        return $this->toArray();
    }
}
