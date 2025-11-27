<?php

declare(strict_types=1);

namespace X402\Laravel\Exceptions;

use X402\Payload\PaymentRequirements;

class PaymentRequiredException extends X402Exception
{
    public function __construct(
        string $message,
        public readonly PaymentRequirements $requirements,
    ) {
        parent::__construct($message);
    }
}
