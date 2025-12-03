<?php

declare(strict_types=1);

use X402\Laravel\PendingPayment;
use X402\Laravel\RequirePayment;

test('pending payment creates middleware string', function () {
    $middleware = PendingPayment::make('0.01')->__toString();

    expect($middleware)->toStartWith(RequirePayment::class . ':');

    $encoded = str_replace(RequirePayment::class . ':', '', $middleware);
    $options = json_decode(base64_decode($encoded), true);

    expect($options)->toBe(['price' => '0.01']);
});

test('pending payment with pay_to', function () {
    $middleware = PendingPayment::make('0.01')
        ->payTo('0x123')
        ->__toString();

    $encoded = str_replace(RequirePayment::class . ':', '', $middleware);
    $options = json_decode(base64_decode($encoded), true);

    expect($options)->toBe([
        'price' => '0.01',
        'pay_to' => '0x123',
    ]);
});

test('pending payment with all options', function () {
    $middleware = PendingPayment::make('0.50')
        ->payTo('0xabc')
        ->network('base')
        ->description('Test payment')
        ->__toString();

    $encoded = str_replace(RequirePayment::class . ':', '', $middleware);
    $options = json_decode(base64_decode($encoded), true);

    expect($options)->toBe([
        'price' => '0.50',
        'pay_to' => '0xabc',
        'network' => 'base',
        'description' => 'Test payment',
    ]);
});

test('pending payment to array', function () {
    $pending = PendingPayment::make('0.01')
        ->payTo('0x123')
        ->network('base-sepolia');

    expect($pending->toArray())->toBe([
        'price' => '0.01',
        'pay_to' => '0x123',
        'network' => 'base-sepolia',
    ]);
});

test('static make creates instance', function () {
    $pending = PendingPayment::make('0.01');

    expect($pending)->toBeInstanceOf(PendingPayment::class);
});

test('methods are fluent', function () {
    $pending = PendingPayment::make('0.01');

    expect($pending->payTo('0x123'))->toBe($pending);
    expect($pending->network('base'))->toBe($pending);
    expect($pending->description('test'))->toBe($pending);
});
