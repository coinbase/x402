<?php

declare(strict_types=1);

namespace X402\Laravel;

use Illuminate\Http\Request;
use Illuminate\Routing\Route;
use Illuminate\Routing\Router;
use Illuminate\Support\ServiceProvider;
use X402\Facilitator;
use X402\FacilitatorInterface;
use X402\Laravel\Http\Controllers\DiscoveryController;

class X402ServiceProvider extends ServiceProvider
{
    #[\Override]
    public function register(): void
    {
        $this->mergeConfigFrom(__DIR__ . '/../config/x402.php', 'x402');

        $this->app->singleton(FacilitatorInterface::class, fn(): \X402\Facilitator => new Facilitator(
            baseUrl: config()->string('x402.facilitator_url'),
        ));

        $this->app->alias(FacilitatorInterface::class, Facilitator::class);

        $this->app->singleton(Discovery::class, fn($app): Discovery => new Discovery($app->make(Router::class)));
    }

    public function boot(): void
    {
        if ($this->app->runningInConsole()) {
            $this->publishes([
                __DIR__ . '/../config/x402.php' => config_path('x402.php'),
            ], 'x402-config');
        }

        /** @var Router $router */
        $router = $this->app->make(Router::class);
        $router->aliasMiddleware('x402', RequirePayment::class);

        $this->registerRouteMacros();
        $this->registerRequestMacros();
    }

    private function registerRouteMacros(): void
    {
        /**
         * @param string $price The price in decimal format (e.g., '0.01')
         * @param array{pay_to?: string, network?: string, description?: string} $options
         */
        Route::macro('paid', function (string $price, array $options = []) {
            /** @var Route $this */
            return $this->middleware(RequirePayment::with($price, $options));
        });

        /**
         * @param string $uri The URI for the discovery endpoint (default: '/discovery/resources' per spec)
         */
        Router::macro('x402Discovery', function (string $uri = '/discovery/resources') {
            /** @var Router $this */
            return $this->get($uri, DiscoveryController::class)->name('x402.discovery');
        });
    }

    private function registerRequestMacros(): void
    {
        Request::macro('payer', function (): ?string {
            /** @var Request $this */
            return $this->attributes->get('x402.payer');
        });

        Request::macro('requirements', function (): ?\X402\Payload\PaymentRequirements {
            /** @var Request $this */
            return $this->attributes->get('x402.requirements');
        });
    }
}
