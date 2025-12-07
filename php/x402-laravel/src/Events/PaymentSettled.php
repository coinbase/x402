<?php

declare(strict_types=1);

namespace X402\Laravel\Events;

use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;
use X402\Payload\PaymentPayload;
use X402\Payload\PaymentRequirements;
use X402\Payload\SettleResponse;

class PaymentSettled
{
    use Dispatchable;
    use SerializesModels;

    public function __construct(
        public readonly string $payer,
        public readonly PaymentPayload $payload,
        public readonly PaymentRequirements $requirements,
        public readonly SettleResponse $settlement,
    ) {
    }
}
