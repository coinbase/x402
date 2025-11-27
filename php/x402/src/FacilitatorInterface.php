<?php

declare(strict_types=1);

namespace X402;

use X402\Payload\PaymentPayload;
use X402\Payload\PaymentRequirements;
use X402\Payload\SettleResponse;
use X402\Payload\VerifyResponse;

interface FacilitatorInterface
{
    public function verify(PaymentPayload $payment, PaymentRequirements $requirements): VerifyResponse;

    public function settle(PaymentPayload $payment, PaymentRequirements $requirements): SettleResponse;

    /**
     * @return array<string, mixed>
     */
    public function supported(): array;
}
