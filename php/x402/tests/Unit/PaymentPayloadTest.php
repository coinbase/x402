<?php

declare(strict_types=1);

use X402\Enum\Scheme;
use X402\Exception\InvalidPayloadException;
use X402\Payload\PaymentPayload;

test('payload decodes from base64', function () {
    $data = [
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

    $encoded = base64_encode(json_encode($data));
    $payload = PaymentPayload::fromBase64($encoded);

    expect($payload->scheme)->toBe(Scheme::Exact);
    expect($payload->network->value)->toBe('base-sepolia');
    expect($payload->signature)->toBe('0xabc123');
    expect($payload->authorization->from)->toBe('0x1234567890123456789012345678901234567890');
});

test('payload encodes to base64', function () {
    $data = [
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

    $encoded = base64_encode(json_encode($data));
    $payload = PaymentPayload::fromBase64($encoded);
    $reencoded = $payload->toBase64();

    $decoded = json_decode(base64_decode($reencoded), true);
    expect($decoded['scheme'])->toBe('exact');
    expect($decoded['network'])->toBe('base-sepolia');
});

test('payload throws on invalid base64', function () {
    expect(fn() => PaymentPayload::fromBase64('not-valid-base64!!!'))
        ->toThrow(InvalidPayloadException::class);
});

test('payload throws on invalid json', function () {
    $encoded = base64_encode('not json');
    expect(fn() => PaymentPayload::fromBase64($encoded))
        ->toThrow(InvalidPayloadException::class);
});

test('payload throws on missing fields', function () {
    $encoded = base64_encode(json_encode(['scheme' => 'exact']));
    expect(fn() => PaymentPayload::fromBase64($encoded))
        ->toThrow(InvalidPayloadException::class);
});
