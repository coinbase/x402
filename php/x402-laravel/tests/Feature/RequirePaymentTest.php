<?php

declare(strict_types=1);

use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use X402\Facilitator;
use X402\FacilitatorInterface;
use X402\Laravel\RequirePayment;
use X402\Payload\SettleResponse;
use X402\Payload\VerifyResponse;

const VALID_PAYMENT = [
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

const PAY_TO = '0x0987654321098765432109876543210987654321';

function mockFacilitator(): FacilitatorInterface
{
    $mock = Mockery::mock(FacilitatorInterface::class);

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

    return $mock;
}

test('returns 402 when X-PAYMENT header is missing', function () {
    $facilitator = Mockery::mock(FacilitatorInterface::class);
    $middleware = new RequirePayment($facilitator);

    $request = Request::create('https://example.com/resource', 'GET');
    $next = fn() => new Response('OK', 200);

    $response = $middleware->handle($request, $next, '0.01', PAY_TO);

    expect($response->getStatusCode())->toBe(402);

    $body = json_decode($response->getContent(), true);
    expect($body['error'])->toBe('X-PAYMENT header required');
    expect($body['x402Version'])->toBe(1);
    expect($body['accepts'])->toBeArray();
});

test('returns 402 when X-PAYMENT header is invalid base64', function () {
    $facilitator = Mockery::mock(FacilitatorInterface::class);
    $middleware = new RequirePayment($facilitator);

    $request = Request::create('https://example.com/resource', 'GET');
    $request->headers->set('X-PAYMENT', 'not-valid-base64!!!');
    $next = fn() => new Response('OK', 200);

    $response = $middleware->handle($request, $next, '0.01', PAY_TO);

    expect($response->getStatusCode())->toBe(402);
});

test('returns 402 when payment network does not match', function () {
    $wrongNetworkPayment = VALID_PAYMENT;
    $wrongNetworkPayment['network'] = 'base';

    $facilitator = Mockery::mock(FacilitatorInterface::class);
    $middleware = new RequirePayment($facilitator);

    $request = Request::create('https://example.com/resource', 'GET');
    $request->headers->set('X-PAYMENT', base64_encode(json_encode($wrongNetworkPayment)));
    $next = fn() => new Response('OK', 200);

    $response = $middleware->handle($request, $next, '0.01', PAY_TO, 'base-sepolia');

    expect($response->getStatusCode())->toBe(402);
    $body = json_decode($response->getContent(), true);
    expect($body['error'])->toBe('Payment does not match requirements');
});

test('processes valid payment successfully', function () {
    $middleware = new RequirePayment(mockFacilitator());

    $request = Request::create('https://example.com/resource', 'GET');
    $request->headers->set('X-PAYMENT', base64_encode(json_encode(VALID_PAYMENT)));
    $next = fn() => new Response('OK', 200);

    $response = $middleware->handle($request, $next, '0.01', PAY_TO, 'base-sepolia');

    expect($response->getStatusCode())->toBe(200);
    expect($response->headers->has('X-PAYMENT-RESPONSE'))->toBeTrue();
});

test('does not settle when handler returns non-2xx response', function () {
    $facilitator = Mockery::mock(FacilitatorInterface::class);

    $facilitator->shouldReceive('verify')
        ->once()
        ->andReturn(new VerifyResponse(
            isValid: true,
            invalidReason: null,
            payer: '0x1234567890123456789012345678901234567890',
        ));

    $facilitator->shouldNotReceive('settle');

    $middleware = new RequirePayment($facilitator);

    $request = Request::create('https://example.com/resource', 'GET');
    $request->headers->set('X-PAYMENT', base64_encode(json_encode(VALID_PAYMENT)));
    $next = fn() => new Response('Error', 500);

    $response = $middleware->handle($request, $next, '0.01', PAY_TO, 'base-sepolia');

    expect($response->getStatusCode())->toBe(500);
    expect($response->headers->has('X-PAYMENT-RESPONSE'))->toBeFalse();
});

test('sets payer attribute on request after verification', function () {
    $middleware = new RequirePayment(mockFacilitator());

    $request = Request::create('https://example.com/resource', 'GET');
    $request->headers->set('X-PAYMENT', base64_encode(json_encode(VALID_PAYMENT)));
    $next = fn() => new Response('OK', 200);

    $middleware->handle($request, $next, '0.01', PAY_TO, 'base-sepolia');

    expect($request->attributes->get('x402.payer'))->toBe('0x1234567890123456789012345678901234567890');
});
