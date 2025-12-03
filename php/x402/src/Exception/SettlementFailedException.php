<?php

declare(strict_types=1);

namespace X402\Exception;

class SettlementFailedException extends X402Exception
{
    public function __construct(
        public readonly string $reason,
    ) {
        parent::__construct("Payment settlement failed: {$reason}");
    }
}
