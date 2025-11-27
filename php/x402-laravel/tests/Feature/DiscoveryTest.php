<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use X402\Enum\Scheme;
use X402\Laravel\Discovery;
use X402\Laravel\Facades\Discovery as DiscoveryFacade;
use X402\Laravel\RequirePayment;
use X402\Networks;
use X402\Payload\PaymentRequirements;
use X402\Value\Amount;

function createTestRequirements(string $resource): PaymentRequirements
{
    $network = Networks::from('base-sepolia');

    return new PaymentRequirements(
        scheme: Scheme::Exact,
        network: $network,
        maxAmountRequired: Amount::fromDecimal('0.01'),
        resource: $resource,
        payTo: '0x1234567890123456789012345678901234567890',
        asset: $network->address,
    );
}

beforeEach(function () {
    app(Discovery::class)->clear();
    config(['x402.pay_to' => '0x1234567890123456789012345678901234567890']);
});

test('can register a discoverable resource', function () {
    $discovery = app(Discovery::class);
    $requirements = createTestRequirements('https://example.com/api/weather');

    $discovery->register($requirements);

    $response = $discovery->resources();

    expect($response->items)->toHaveCount(1);
    expect($response->items[0]->resource)->toBe('https://example.com/api/weather');
    expect($response->items[0]->type)->toBe('http');
    expect($response->items[0]->accepts)->toHaveCount(1);
});

test('can register resource with metadata', function () {
    $discovery = app(Discovery::class);
    $requirements = createTestRequirements('https://example.com/api/data');

    $discovery->register($requirements, ['description' => 'Data API', 'version' => '1.0']);

    $response = $discovery->resources();

    expect($response->items[0]->metadata)->toBe(['description' => 'Data API', 'version' => '1.0']);
});

test('can unregister a resource', function () {
    $discovery = app(Discovery::class);
    $requirements = createTestRequirements('https://example.com/api/weather');

    $discovery->register($requirements);
    expect($discovery->resources()->items)->toHaveCount(1);

    $discovery->unregister('https://example.com/api/weather');
    expect($discovery->resources()->items)->toHaveCount(0);
});

test('supports pagination', function () {
    $discovery = app(Discovery::class);

    for ($i = 1; $i <= 5; $i++) {
        $discovery->register(createTestRequirements("https://example.com/api/resource{$i}"));
    }

    $response = $discovery->resources(limit: 2, offset: 0);
    expect($response->items)->toHaveCount(2);
    expect($response->pagination->limit)->toBe(2);
    expect($response->pagination->offset)->toBe(0);
    expect($response->pagination->total)->toBe(5);

    $response = $discovery->resources(limit: 2, offset: 2);
    expect($response->items)->toHaveCount(2);
    expect($response->pagination->offset)->toBe(2);
});

test('register returns self for chaining', function () {
    $discovery = app(Discovery::class);

    $discovery
        ->register(createTestRequirements('https://example.com/api/one'))
        ->register(createTestRequirements('https://example.com/api/two'));

    expect($discovery->resources()->items)->toHaveCount(2);
});

test('facade provides access to discovery', function () {
    DiscoveryFacade::register(createTestRequirements('https://example.com/api/test'));

    $response = DiscoveryFacade::resources();

    expect($response->items)->toHaveCount(1);
});

test('auto-discovers routes with paid middleware', function () {
    Route::get('/paid-resource', fn () => 'ok')->paid('0.50');

    $discovery = app(Discovery::class);
    $discovery->discoverRoutes();

    $response = $discovery->resources();

    expect($response->items)->toHaveCount(1);
    expect($response->items[0]->accepts[0]->maxAmountRequired->toDecimal())->toBe('0.500000');
});

test('auto-discovers routes with RequirePayment middleware', function () {
    Route::middleware(RequirePayment::with('1.00', ['network' => 'base-sepolia']))
        ->get('/expensive-resource', fn () => 'ok');

    $discovery = app(Discovery::class);
    $discovery->discoverRoutes();

    $response = $discovery->resources();

    expect($response->items)->toHaveCount(1);
});

test('discovery endpoint returns JSON response', function () {
    Route::x402Discovery();
    Route::get('/paid-api', fn () => 'ok')->paid('0.25');

    $response = $this->getJson('/discovery/resources');

    $response->assertOk();
    $response->assertJsonStructure([
        'x402Version',
        'items' => [
            '*' => [
                'resource',
                'type',
                'x402Version',
                'accepts',
                'lastUpdated',
            ],
        ],
        'pagination' => [
            'limit',
            'offset',
            'total',
        ],
    ]);
});

test('discovery endpoint supports pagination', function () {
    Route::x402Discovery();

    for ($i = 1; $i <= 5; $i++) {
        Route::get("/api/resource{$i}", fn () => 'ok')->paid('0.01');
    }

    $response = $this->getJson('/discovery/resources?limit=2&offset=1');

    $response->assertOk();
    $response->assertJsonPath('pagination.limit', 2);
    $response->assertJsonPath('pagination.offset', 1);
    $response->assertJsonPath('pagination.total', 5);
});

test('discovery endpoint validates parameters', function () {
    Route::x402Discovery();

    $response = $this->getJson('/discovery/resources?limit=-1');
    $response->assertStatus(422);

    $response = $this->getJson('/discovery/resources?limit=101');
    $response->assertStatus(422);

    $response = $this->getJson('/discovery/resources?type=invalid');
    $response->assertStatus(422);
});

test('discovery endpoint filters by type', function () {
    Route::x402Discovery();
    Route::get('/paid-api', fn () => 'ok')->paid('0.01');

    $response = $this->getJson('/discovery/resources?type=http');
    $response->assertOk();
    $response->assertJsonPath('pagination.total', 1);
});

test('discovery endpoint supports metadata filtering (Bazaar)', function () {
    Route::x402Discovery();

    $discovery = app(\X402\Laravel\Discovery::class);

    $discovery->register(
        createTestRequirements('https://example.com/api/finance'),
        ['category' => 'finance', 'provider' => 'Acme Corp']
    );
    $discovery->register(
        createTestRequirements('https://example.com/api/weather'),
        ['category' => 'weather', 'provider' => 'Acme Corp']
    );
    $discovery->register(
        createTestRequirements('https://example.com/api/data'),
        ['category' => 'finance', 'provider' => 'Other Inc']
    );

    $response = $this->getJson('/discovery/resources?metadata[category]=finance');
    $response->assertOk();
    $response->assertJsonPath('pagination.total', 2);

    $response = $this->getJson('/discovery/resources?metadata[provider]=Acme Corp');
    $response->assertOk();
    $response->assertJsonPath('pagination.total', 2);

    $response = $this->getJson('/discovery/resources?metadata[category]=finance&metadata[provider]=Acme Corp');
    $response->assertOk();
    $response->assertJsonPath('pagination.total', 1);
});

test('route x402Discovery macro registers endpoint at default path', function () {
    Route::x402Discovery();

    $response = $this->getJson('/discovery/resources');

    $response->assertOk();
});

test('route x402Discovery macro accepts custom path', function () {
    Route::x402Discovery('/custom/bazaar');

    $response = $this->getJson('/custom/bazaar');

    $response->assertOk();
});
