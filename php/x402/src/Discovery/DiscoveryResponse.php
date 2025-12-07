<?php

declare(strict_types=1);

namespace X402\Discovery;

use JsonSerializable;

readonly class DiscoveryResponse implements JsonSerializable
{
    /**
     * @param DiscoveryResource[] $items
     */
    public function __construct(
        public array $items,
        public Pagination $pagination,
        public int $x402Version = 1,
    ) {
    }

    /**
     * @return array{
     *  x402Version: int,
     *  items: array<int, array<string, mixed>>,
     *  pagination: array{limit: int, offset: int, total: int}
     * }
     */
    public function toArray(): array
    {
        return [
            'x402Version' => $this->x402Version,
            'items' => $this->items
                |> (fn($arr): array => array_map(fn(DiscoveryResource $r): array => $r->toArray(), $arr))
                |> array_values(...),
            'pagination' => $this->pagination->toArray(),
        ];
    }

    /**
     * @return array{
     *  x402Version: int,
     *  items: array<int, array<string, mixed>>,
     *  pagination: array{limit: int, offset: int, total: int}
     * }
     */
    public function jsonSerialize(): array
    {
        return $this->toArray();
    }
}
