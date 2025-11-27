<?php

declare(strict_types=1);

namespace X402\Laravel;

use Illuminate\Routing\Route;
use Illuminate\Routing\Router;
use X402\Discovery\DiscoveryResource;
use X402\Discovery\DiscoveryResponse;
use X402\Discovery\Pagination;
use X402\Enum\Scheme;
use X402\Networks;
use X402\Payload\PaymentRequirements;
use X402\Value\Amount;

class Discovery
{
    /**
     * @var array<string, array{
     *     requirements: PaymentRequirements,
     *     metadata: array<string, mixed>|null,
     *     lastUpdated: int,
     * }>
     */
    private array $resources = [];

    private bool $routesDiscovered = false;

    public function __construct(
        private readonly Router $router,
    ) {
    }

    /**
     * @param array<string, mixed>|null $metadata Optional metadata for the resource
     */
    public function register(PaymentRequirements $requirements, ?array $metadata = null): self
    {
        $this->resources[$requirements->resource] = [
            'requirements' => $requirements,
            'metadata' => $metadata,
            'lastUpdated' => time(),
        ];

        return $this;
    }

    public function unregister(string $resource): self
    {
        unset($this->resources[$resource]);

        return $this;
    }

    public function clear(): self
    {
        $this->resources = [];
        $this->routesDiscovered = false;

        return $this;
    }

    /**
     * @return array<string, array{requirements: PaymentRequirements, metadata: array<string, mixed>|null}>
     */
    public function all(): array
    {
        return array_map(fn(array $data): array => [
            'requirements' => $data['requirements'],
            'metadata' => $data['metadata'],
        ], $this->resources);
    }

    /**
     * Auto-discover all routes using the RequirePayment middleware.
     */
    public function discoverRoutes(): self
    {
        if ($this->routesDiscovered) {
            return $this;
        }

        $this->routesDiscovered = true;

        /** @var iterable<Route> $routes */
        $routes = $this->router->getRoutes();
        foreach ($routes as $route) {
            $this->discoverRoute($route);
        }

        return $this;
    }

    /**
     * @param string|null $type Filter by resource type (only 'http' supported)
     * @param int $limit Maximum results (1-100, default 20 per spec)
     * @param int $offset Pagination offset
     * @param array<string, string>|null $metadata Filter by metadata fields
     */
    public function resources(
        ?string $type = null,
        int $limit = 20,
        int $offset = 0,
        ?array $metadata = null,
    ): DiscoveryResponse {
        $items = [];

        foreach ($this->resources as $resource => $data) {
            // Filter by type
            if ($type !== null && $type !== 'http') {
                continue;
            }

            // Filter by metadata (Bazaar search)
            if ($metadata !== null && !$this->matchesMetadata($data['metadata'], $metadata)) {
                continue;
            }

            $items[] = new DiscoveryResource(
                resource: $resource,
                type: 'http',
                accepts: [$data['requirements']],
                lastUpdated: $data['lastUpdated'],
                metadata: $data['metadata'],
            );
        }

        $total = count($items);
        $items = array_slice($items, $offset, $limit);

        return new DiscoveryResponse(
            items: $items,
            pagination: new Pagination(
                limit: $limit,
                offset: $offset,
                total: $total,
            ),
        );
    }

    /**
     * @param array<string, mixed>|null $resourceMetadata
     * @param array<string, string> $filters
     */
    private function matchesMetadata(?array $resourceMetadata, array $filters): bool
    {
        if ($resourceMetadata === null) {
            return false;
        }
        return array_all(
            $filters,
            fn($value, $key): bool => isset($resourceMetadata[$key])
                && (string) $resourceMetadata[$key] === $value,
        );
    }

    private function discoverRoute(Route $route): void
    {
        /** @var array<int, string> $middlewares */
        $middlewares = $route->middleware();
        foreach ($middlewares as $middleware) {
            if (!str_starts_with((string) $middleware, RequirePayment::class . ':')) {
                continue;
            }

            $requirements = $this->parseMiddlewareToRequirements($middleware, $route);

            if ($requirements instanceof \X402\Payload\PaymentRequirements) {
                $this->resources[$requirements->resource] = [
                    'requirements' => $requirements,
                    'metadata' => null,
                    'lastUpdated' => time(),
                ];
            }
        }
    }

    private function parseMiddlewareToRequirements(string $middleware, Route $route): ?PaymentRequirements
    {
        $encoded = str_replace(RequirePayment::class . ':', '', $middleware);

        $decoded = base64_decode($encoded, true);
        if ($decoded !== false) {
            $options = json_decode($decoded, true);
            if (is_array($options) && isset($options['price'])) {
                return $this->buildRequirements($route, $options);
            }
        }

        $parts = explode(',', $encoded);
        $options = ['price' => $parts[0]];

        if (isset($parts[1]) && $parts[1] !== '') {
            $options['pay_to'] = $parts[1];
        }

        if (isset($parts[2]) && $parts[2] !== '') {
            $options['network'] = $parts[2];
        }

        return $this->buildRequirements($route, $options);
    }

    /**
     * @param array{price: string, pay_to?: string, network?: string, description?: string} $options
     */
    private function buildRequirements(Route $route, array $options): ?PaymentRequirements
    {
        $payTo = $options['pay_to'] ?? config('x402.pay_to');
        $networkValue = $options['network'] ?? config('x402.network', 'base-sepolia');

        if (!$payTo || !is_string($payTo) || !is_string($networkValue)) {
            return null;
        }

        $network = Networks::from($networkValue);
        $uri = $route->uri();
        $resource = url($uri);

        return new PaymentRequirements(
            scheme: Scheme::Exact,
            network: $network,
            maxAmountRequired: Amount::fromDecimal($options['price']),
            resource: $resource,
            payTo: $payTo,
            asset: $network->address,
            extra: [
                'name' => $network->name,
                'version' => $network->version,
                'description' => $options['description'] ?? config('x402.description'),
            ],
        );
    }
}
