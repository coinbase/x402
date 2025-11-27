<?php

declare(strict_types=1);

namespace X402;

use X402\Http\FacilitatorClient;
use X402\Value\Network;

final class X402
{
    public const int VERSION = 1;

    public static function facilitator(?FacilitatorClient $http = null, ?string $url = null): Facilitator
    {
        return new Facilitator($http, $url ?? Facilitator::DEFAULT_URL);
    }

    public static function middleware(
        string $payTo,
        string $price,
        ?Facilitator $facilitator = null,
        Network|string|null $network = null,
        string $description = '',
    ): PaymentMiddleware {
        if ($network === null) {
            $network = Networks::from('base-sepolia');
        } elseif (is_string($network)) {
            $network = Networks::from($network);
        }

        return new PaymentMiddleware(
            payTo: $payTo,
            price: $price,
            facilitator: $facilitator ?? new Facilitator(),
            network: $network,
            description: $description,
        );
    }
}
