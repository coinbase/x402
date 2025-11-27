<?php

declare(strict_types=1);

namespace X402\Value;

use X402\Enum\NetworkType;

readonly class Network
{
    public function __construct(
        public string $value,
        public int $chainId,
        public NetworkType $type,
        public string $address,
        public string $name,
        public bool $testnet = false,
        public int $decimals = 6,
        public string $version = '2'
    ) {
    }

    public function supports(NetworkType $type): bool
    {
        return $this->type === $type;
    }
}
