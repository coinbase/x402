<?php

declare(strict_types=1);

namespace X402\Discovery;

use JsonSerializable;

readonly class Pagination implements JsonSerializable
{
    public function __construct(
        public int $limit,
        public int $offset,
        public int $total,
    ) {
    }

    /**
     * @return array{limit: int, offset: int, total: int}
     */
    public function toArray(): array
    {
        return [
            'limit' => $this->limit,
            'offset' => $this->offset,
            'total' => $this->total,
        ];
    }

    /**
     * @return array{limit: int, offset: int, total: int}
     */
    public function jsonSerialize(): array
    {
        return $this->toArray();
    }
}
