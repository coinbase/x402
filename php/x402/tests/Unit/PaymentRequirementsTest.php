<?php

declare(strict_types=1);

use X402\Enum\Scheme;
use X402\Networks;
use X402\Payload\PaymentRequirements;
use X402\Value\Amount;

test('creates payment requirements', function () {
    $network = Networks::from('base-sepolia');

    $requirements = new PaymentRequirements(
        scheme: Scheme::Exact,
        network: $network,
        maxAmountRequired: Amount::fromDecimal('0.01'),
        resource: 'https://api.example.com/data',
        payTo: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        asset: $network->address,
    );

    expect($requirements->scheme)->toBe(Scheme::Exact);
    expect($requirements->network->value)->toBe('base-sepolia');
    expect($requirements->maxAmountRequired->value)->toBe('10000');
    expect($requirements->asset)->toBe($network->address);
});

test('creates payment requirements with custom network', function () {
    $network = Networks::from('base');

    $requirements = new PaymentRequirements(
        scheme: Scheme::Exact,
        network: $network,
        maxAmountRequired: Amount::fromDecimal('1.00'),
        resource: 'https://api.example.com/data',
        payTo: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        asset: $network->address,
    );

    expect($requirements->network->value)->toBe('base');
    expect($requirements->asset)->toBe(Networks::from('base')->address);
});

test('serializes to array correctly', function () {
    $network = Networks::from('base-sepolia');

    $requirements = new PaymentRequirements(
        scheme: Scheme::Exact,
        network: $network,
        maxAmountRequired: Amount::fromDecimal('0.01'),
        resource: 'https://api.example.com/data',
        payTo: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        asset: $network->address,
        description: 'Test resource',
        extra: [
            'name' => $network->name,
            'version' => $network->version,
        ],
    );

    $array = $requirements->toArray();

    expect($array['scheme'])->toBe('exact');
    expect($array['network'])->toBe('base-sepolia');
    expect($array['maxAmountRequired'])->toBe('10000');
    expect($array['description'])->toBe('Test resource');
    expect($array['extra'])->toHaveKey('name');
    expect($array['extra'])->toHaveKey('version');
});
