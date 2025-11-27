<?php

declare(strict_types=1);

namespace X402\Laravel\Tests;

use Orchestra\Testbench\TestCase as BaseTestCase;
use X402\Laravel\X402ServiceProvider;

abstract class TestCase extends BaseTestCase
{
    protected function getPackageProviders($app): array
    {
        return [
            X402ServiceProvider::class,
        ];
    }

    protected function defineEnvironment($app): void
    {
        $app['config']->set('x402.facilitator_url', 'https://x402.org/facilitator');
        $app['config']->set('x402.network', 'base-sepolia');
    }
}
