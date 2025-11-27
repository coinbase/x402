<?php

declare(strict_types=1);

use X402\Value\Amount;

test('amount converts from usd', function () {
    $amount = Amount::fromDecimal('0.01');
    expect($amount->value)->toBe('10000');
});

test('amount converts from usd with dollar sign', function () {
    $amount = Amount::fromDecimal('$0.01');
    expect($amount->value)->toBe('10000');
});

test('amount converts to decimal', function () {
    $amount = new Amount('10000', 6);
    expect($amount->toDecimal())->toBe('0.010000');
});

test('amount handles larger values', function () {
    $amount = Amount::fromDecimal('100.50');
    expect($amount->value)->toBe('100500000');
});

test('amount handles small decimals', function () {
    $amount = Amount::fromDecimal('0.000001');
    expect($amount->value)->toBe('1');
});

test('amount serializes to string', function () {
    $amount = Amount::fromDecimal('1.00');
    expect((string) $amount)->toBe('1000000');
    expect($amount->jsonSerialize())->toBe('1000000');
});
