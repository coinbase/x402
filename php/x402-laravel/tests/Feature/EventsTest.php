<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Route;
use X402\Exception\SettlementFailedException;
use X402\Exception\VerificationFailedException;
use X402\FacilitatorInterface;
use X402\Laravel\Events\PaymentFailed;
use X402\Laravel\Events\PaymentSettled;
use X402\Laravel\Events\PaymentVerified;
use X402\Laravel\RequirePayment;
use X402\Payload\SettleResponse;
use X402\Payload\VerifyResponse;

function getEventTestPayment(): array
{
    return [
        'x402Version' => 1,
        'scheme' => 'exact',
        'network' => 'base-sepolia',
        'payload' => [
            'signature' => '0xabc123',
            'authorization' => [
                'from' => '0x1234567890123456789012345678901234567890',
                'to' => '0x0987654321098765432109876543210987654321',
                'value' => '10000',
                'validAfter' => '1700000000',
                'validBefore' => '1700003600',
                'nonce' => '0xabcdef',
            ],
        ],
    ];
}

const EVENT_TEST_PAY_TO = '0x0987654321098765432109876543210987654321';

test('dispatches PaymentVerified event on successful verification', function () {
    // Set up mock BEFORE faking events
    $this->mock(FacilitatorInterface::class, function ($mock) {
        $mock->shouldReceive('verify')
            ->andReturn(new VerifyResponse(
                isValid: true,
                invalidReason: null,
                payer: '0x1234567890123456789012345678901234567890',
            ));
        $mock->shouldReceive('settle')
            ->andReturn(new SettleResponse(
                success: true,
                transaction: '0xtxhash123',
                network: 'base-sepolia',
            ));
    });

    Event::fake([PaymentVerified::class, PaymentSettled::class]);

    Route::middleware(RequirePayment::with('0.01', ['pay_to' => EVENT_TEST_PAY_TO]))
        ->get('/event-test-verified', fn () => response('OK'));

    $response = $this->getJson('/event-test-verified', ['X-PAYMENT' => base64_encode(json_encode(getEventTestPayment()))]);
    $response->assertSuccessful();

    Event::assertDispatched(PaymentVerified::class, function ($event) {
        return $event->payer === '0x1234567890123456789012345678901234567890';
    });
});

test('dispatches PaymentSettled event on successful settlement', function () {
    $this->mock(FacilitatorInterface::class, function ($mock) {
        $mock->shouldReceive('verify')
            ->andReturn(new VerifyResponse(
                isValid: true,
                invalidReason: null,
                payer: '0x1234567890123456789012345678901234567890',
            ));
        $mock->shouldReceive('settle')
            ->andReturn(new SettleResponse(
                success: true,
                transaction: '0xtxhash123',
                network: 'base-sepolia',
            ));
    });

    Event::fake([PaymentVerified::class, PaymentSettled::class]);

    Route::middleware(RequirePayment::with('0.01', ['pay_to' => EVENT_TEST_PAY_TO]))
        ->get('/event-test-settled', fn () => response('OK'));

    $response = $this->getJson('/event-test-settled', ['X-PAYMENT' => base64_encode(json_encode(getEventTestPayment()))]);
    $response->assertSuccessful();

    Event::assertDispatched(PaymentSettled::class, function ($event) {
        return $event->payer === '0x1234567890123456789012345678901234567890'
            && $event->settlement->transaction === '0xtxhash123';
    });
});

test('dispatches PaymentFailed event when verification fails', function () {
    $this->mock(FacilitatorInterface::class, function ($mock) {
        $mock->shouldReceive('verify')
            ->andThrow(new VerificationFailedException('Invalid signature', null));
    });

    Event::fake([PaymentFailed::class]);

    Route::middleware(RequirePayment::with('0.01', ['pay_to' => EVENT_TEST_PAY_TO]))
        ->get('/event-test-verify-fail', fn () => response('OK'));

    $response = $this->getJson('/event-test-verify-fail', ['X-PAYMENT' => base64_encode(json_encode(getEventTestPayment()))]);
    $response->assertStatus(402);

    Event::assertDispatched(PaymentFailed::class, function ($event) {
        return $event->reason === 'Invalid signature';
    });
});

test('dispatches PaymentFailed event when settlement fails', function () {
    $this->mock(FacilitatorInterface::class, function ($mock) {
        $mock->shouldReceive('verify')
            ->andReturn(new VerifyResponse(
                isValid: true,
                invalidReason: null,
                payer: '0x1234567890123456789012345678901234567890',
            ));
        $mock->shouldReceive('settle')
            ->andThrow(new SettlementFailedException('Insufficient funds'));
    });

    Event::fake([PaymentFailed::class, PaymentVerified::class]);

    Route::middleware(RequirePayment::with('0.01', ['pay_to' => EVENT_TEST_PAY_TO]))
        ->get('/event-test-settle-fail', fn () => response('OK'));

    $response = $this->getJson('/event-test-settle-fail', ['X-PAYMENT' => base64_encode(json_encode(getEventTestPayment()))]);
    $response->assertStatus(402);

    Event::assertDispatched(PaymentFailed::class, function ($event) {
        return $event->reason === 'Insufficient funds'
            && $event->payer === '0x1234567890123456789012345678901234567890';
    });
});

test('dispatches PaymentFailed event when header is missing', function () {
    Event::fake([PaymentFailed::class]);

    Route::middleware(RequirePayment::with('0.01', ['pay_to' => EVENT_TEST_PAY_TO]))
        ->get('/event-test-no-header', fn () => response('OK'));

    $response = $this->getJson('/event-test-no-header');
    $response->assertStatus(402);

    Event::assertDispatched(PaymentFailed::class, function ($event) {
        return $event->reason === 'X-PAYMENT header required';
    });
});
