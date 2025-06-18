<?php

declare(strict_types=1);

namespace Coinbase\X402\Laravel;

use Illuminate\Support\ServiceProvider;
use Coinbase\X402\Client;

class X402ServiceProvider extends ServiceProvider
{
    public function register()
    {
        $this->app->singleton(Client::class, function ($app) {
            return new Client(config('x402'));
        });
    }

    public function boot()
    {
        $this->publishes([
            __DIR__.'/../../config/x402.php' => config_path('x402.php'),
        ], 'config');
    }
}