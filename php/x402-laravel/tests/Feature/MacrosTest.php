<?php

declare(strict_types=1);

use Illuminate\Http\Request;
use Illuminate\Routing\Route;
use Illuminate\Support\Facades\Route as RouteFacade;
use X402\Laravel\RequirePayment;

test('route has paid macro', function () {
    expect(Route::hasMacro('paid'))->toBeTrue();
});

test('paid macro adds middleware to route', function () {
    $route = RouteFacade::get('/test', fn () => 'ok')->paid('0.01');

    $middleware = $route->middleware();

    expect($middleware)->toBeArray();
    expect($middleware)->not->toBeEmpty();

    $found = false;
    foreach ($middleware as $m) {
        if (str_starts_with($m, RequirePayment::class)) {
            $found = true;
            break;
        }
    }
    expect($found)->toBeTrue();
});

test('paid macro with options', function () {
    $route = RouteFacade::get('/test2', fn () => 'ok')->paid('0.50', [
        'pay_to' => '0x123',
        'network' => 'base',
    ]);

    $middleware = $route->middleware();

    $x402Middleware = null;
    foreach ($middleware as $m) {
        if (str_starts_with($m, RequirePayment::class)) {
            $x402Middleware = $m;
            break;
        }
    }

    expect($x402Middleware)->not->toBeNull();

    $encoded = str_replace(RequirePayment::class . ':', '', $x402Middleware);
    $options = json_decode(base64_decode($encoded), true);

    expect($options['price'])->toBe('0.50');
    expect($options['pay_to'])->toBe('0x123');
    expect($options['network'])->toBe('base');
});

test('request has payer macro', function () {
    expect(Request::hasMacro('payer'))->toBeTrue();
});

test('request payer returns null when not set', function () {
    $request = Request::create('/test');

    expect($request->payer())->toBeNull();
});

test('request payer returns value when set', function () {
    $request = Request::create('/test');
    $request->attributes->set('x402.payer', '0xPayer123');

    expect($request->payer())->toBe('0xPayer123');
});

test('request has requirements macro', function () {
    expect(Request::hasMacro('requirements'))->toBeTrue();
});

test('request requirements returns null when not set', function () {
    $request = Request::create('/test');

    expect($request->requirements())->toBeNull();
});
