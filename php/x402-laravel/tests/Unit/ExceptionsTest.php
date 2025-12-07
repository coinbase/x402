<?php

declare(strict_types=1);

use X402\Laravel\Exceptions\MissingConfigurationException;
use X402\Laravel\Exceptions\PaymentRequiredException;
use X402\Laravel\Exceptions\X402Exception;
use X402\Payload\PaymentRequirements;

test('X402Exception is base exception', function () {
    $exception = new X402Exception('test');

    expect($exception)->toBeInstanceOf(Exception::class);
    expect($exception->getMessage())->toBe('test');
});

test('MissingConfigurationException has helpful message', function () {
    $exception = new MissingConfigurationException('pay_to');

    expect($exception)->toBeInstanceOf(X402Exception::class);
    expect($exception->getMessage())->toContain('pay_to');
    expect($exception->getMessage())->toContain('X402_PAY_TO');
    expect($exception->getMessage())->toContain('.env');
});

test('PaymentRequiredException contains requirements', function () {
    $requirements = Mockery::mock(PaymentRequirements::class);
    $exception = new PaymentRequiredException('Payment required', $requirements);

    expect($exception)->toBeInstanceOf(X402Exception::class);
    expect($exception->getMessage())->toBe('Payment required');
    expect($exception->requirements)->toBe($requirements);
});
