<?php

declare(strict_types=1);

namespace X402\Laravel\Events;

use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;
use X402\Payload\PaymentPayload;
use X402\Payload\PaymentRequirements;

class PaymentFailed
{
    use Dispatchable;
    use SerializesModels;

    public function __construct(
        public readonly string $reason,
        public readonly PaymentRequirements $requirements,
        public readonly ?PaymentPayload $payload = null,
        public readonly ?string $payer = null,
    ) {
    }
}
