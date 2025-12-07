<?php

declare(strict_types=1);

namespace X402\Laravel\Facades;

use Illuminate\Support\Facades\Facade;
use X402\Laravel\Discovery as DiscoveryService;

/**
 * @method static DiscoveryService register(\X402\Payload\PaymentRequirements $r, ?array<string, mixed> $meta = null)
 * @method static DiscoveryService unregister(string $resource)
 * @method static DiscoveryService clear()
 * @method static \X402\Discovery\DiscoveryResponse resources(?string $type = null, int $limit = 20, int $offset = 0)
 * @method static DiscoveryService discoverRoutes()
 * @method static array<string, mixed> all()
 *
 * @see \X402\Laravel\Discovery
 */
class Discovery extends Facade
{
    protected static function getFacadeAccessor(): string
    {
        return DiscoveryService::class;
    }
}
