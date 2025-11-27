<?php

declare(strict_types=1);

use GuzzleHttp\Client;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Psr7\Response as GuzzleResponse;
use Illuminate\Support\Facades\Route;
use X402\Facilitator;
use X402\FacilitatorInterface;
use X402\Http\FacilitatorClient;

const VALID_PAYMENT_DATA = [
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

const PAY_TO_ADDRESS = '0x0987654321098765432109876543210987654321';

beforeEach(function () {
    Route::middleware('x402:0.01,' . PAY_TO_ADDRESS . ',base-sepolia')
        ->get('/paid-resource', fn() => response()->json(['data' => 'premium content']));

    Route::get('/free-resource', fn() => response()->json(['data' => 'free content']));
});

function mockGuzzle(array $responses): Client
{
    $mock = new MockHandler($responses);
    return new Client(['handler' => HandlerStack::create($mock)]);
}

function mockFacilitatorHttp(array $responses): void
{
    $client = new FacilitatorClient(mockGuzzle($responses));
    app()->instance(FacilitatorInterface::class, new Facilitator($client));
}

test('free route is accessible without payment', function () {
    $this->getJson('/free-resource')
        ->assertStatus(200)
        ->assertJson(['data' => 'free content']);
});

test('paid route returns 402 without X-PAYMENT header', function () {
    $this->getJson('/paid-resource')
        ->assertStatus(402)
        ->assertJson([
            'x402Version' => 1,
            'error' => 'X-PAYMENT header required',
        ])
        ->assertJsonStructure(['accepts']);
});

test('paid route returns 402 with invalid X-PAYMENT header', function () {
    $this->getJson('/paid-resource', ['X-PAYMENT' => 'invalid!!!'])
        ->assertStatus(402);
});

test('paid route returns 402 when payment network does not match', function () {
    $wrongNetwork = VALID_PAYMENT_DATA;
    $wrongNetwork['network'] = 'base';

    $this->getJson('/paid-resource', ['X-PAYMENT' => base64_encode(json_encode($wrongNetwork))])
        ->assertStatus(402)
        ->assertJson(['error' => 'Payment does not match requirements']);
});

test('paid route returns content with valid payment', function () {
    mockFacilitatorHttp([
        new GuzzleResponse(200, [], json_encode(['isValid' => true, 'payer' => '0x123'])),
        new GuzzleResponse(200, [], json_encode(['success' => true, 'transaction' => '0xtx', 'network' => 'base-sepolia'])),
    ]);

    $this->getJson('/paid-resource', ['X-PAYMENT' => base64_encode(json_encode(VALID_PAYMENT_DATA))])
        ->assertStatus(200)
        ->assertJson(['data' => 'premium content'])
        ->assertHeader('X-PAYMENT-RESPONSE');
});

test('paid route includes payment requirements in 402 response', function () {
    $response = $this->getJson('/paid-resource');

    $accepts = $response->json('accepts.0');
    expect($accepts['scheme'])->toBe('exact');
    expect($accepts['network'])->toBe('base-sepolia');
    expect($accepts['payTo'])->toBe(PAY_TO_ADDRESS);
    expect($accepts['maxAmountRequired'])->toBe('10000');
});

test('paid route returns 402 when verification fails', function () {
    mockFacilitatorHttp([
        new GuzzleResponse(200, [], json_encode([
            'isValid' => false,
            'invalidReason' => 'Insufficient funds',
        ])),
    ]);

    $this->getJson('/paid-resource', ['X-PAYMENT' => base64_encode(json_encode(VALID_PAYMENT_DATA))])
        ->assertStatus(402)
        ->assertJson(['error' => 'Insufficient funds']);
});

test('paid route returns 402 when settlement fails', function () {
    mockFacilitatorHttp([
        new GuzzleResponse(200, [], json_encode(['isValid' => true, 'payer' => '0x123'])),
        new GuzzleResponse(200, [], json_encode(['success' => false, 'errorReason' => 'Transaction reverted'])),
    ]);

    $this->getJson('/paid-resource', ['X-PAYMENT' => base64_encode(json_encode(VALID_PAYMENT_DATA))])
        ->assertStatus(402)
        ->assertJson(['error' => 'Transaction reverted']);
});

test('payer is available in request attributes', function () {
    mockFacilitatorHttp([
        new GuzzleResponse(200, [], json_encode(['isValid' => true, 'payer' => '0xPayerWallet'])),
        new GuzzleResponse(200, [], json_encode(['success' => true, 'transaction' => '0xtx', 'network' => 'base-sepolia'])),
    ]);

    Route::middleware('x402:0.01,' . PAY_TO_ADDRESS . ',base-sepolia')
        ->get('/check-payer', fn(\Illuminate\Http\Request $request) => response()->json([
            'payer' => $request->attributes->get('x402.payer'),
        ]));

    $this->getJson('/check-payer', ['X-PAYMENT' => base64_encode(json_encode(VALID_PAYMENT_DATA))])
        ->assertStatus(200)
        ->assertJson(['payer' => '0xPayerWallet']);
});
