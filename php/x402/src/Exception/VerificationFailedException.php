<?php

declare(strict_types=1);

namespace X402\Exception;

class VerificationFailedException extends X402Exception
{
    public function __construct(
        public readonly string $reason,
        public readonly ?string $payer = null,
    ) {
        parent::__construct("Payment verification failed: {$reason}");
    }
}
