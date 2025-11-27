<?php

declare(strict_types=1);

use X402\Enum\NetworkType;
use X402\Networks;
use X402\Value\Network;

test('network returns correct chain id', function () {
    // EVM Mainnets
    expect(Networks::from('base')->chainId)->toBe(8453);
    expect(Networks::from('avalanche')->chainId)->toBe(43114);
    expect(Networks::from('polygon')->chainId)->toBe(137);
    expect(Networks::from('sei')->chainId)->toBe(1329);
    expect(Networks::from('iotex')->chainId)->toBe(4689);
    expect(Networks::from('peaq')->chainId)->toBe(3338);
    expect(Networks::from('story')->chainId)->toBe(1514);
    expect(Networks::from('educhain')->chainId)->toBe(41923);
    expect(Networks::from('abstract')->chainId)->toBe(2741);

    // EVM Testnets
    expect(Networks::from('base-sepolia')->chainId)->toBe(84532);
    expect(Networks::from('avalanche-fuji')->chainId)->toBe(43113);
    expect(Networks::from('polygon-amoy')->chainId)->toBe(80002);
    expect(Networks::from('sei-testnet')->chainId)->toBe(1328);
    expect(Networks::from('abstract-testnet')->chainId)->toBe(11124);
    expect(Networks::from('skale-base-sepolia')->chainId)->toBe(324705682);

    // Solana
    expect(Networks::from('solana')->chainId)->toBe(101);
    expect(Networks::from('solana-devnet')->chainId)->toBe(103);
});

test('network identifies testnets', function () {
    // Testnets
    expect(Networks::from('base-sepolia')->testnet)->toBeTrue();
    expect(Networks::from('avalanche-fuji')->testnet)->toBeTrue();
    expect(Networks::from('polygon-amoy')->testnet)->toBeTrue();
    expect(Networks::from('sei-testnet')->testnet)->toBeTrue();
    expect(Networks::from('abstract-testnet')->testnet)->toBeTrue();
    expect(Networks::from('skale-base-sepolia')->testnet)->toBeTrue();
    expect(Networks::from('solana-devnet')->testnet)->toBeTrue();

    // Mainnets
    expect(Networks::from('base')->testnet)->toBeFalse();
    expect(Networks::from('avalanche')->testnet)->toBeFalse();
    expect(Networks::from('polygon')->testnet)->toBeFalse();
    expect(Networks::from('sei')->testnet)->toBeFalse();
    expect(Networks::from('solana')->testnet)->toBeFalse();
});

test('network supports correct type', function () {
    // EVM networks
    expect(Networks::from('base')->supports(NetworkType::Evm))->toBeTrue();
    expect(Networks::from('base-sepolia')->supports(NetworkType::Evm))->toBeTrue();
    expect(Networks::from('polygon')->supports(NetworkType::Evm))->toBeTrue();
    expect(Networks::from('sei')->supports(NetworkType::Evm))->toBeTrue();
    expect(Networks::from('base')->supports(NetworkType::Solana))->toBeFalse();

    // Solana networks
    expect(Networks::from('solana')->supports(NetworkType::Solana))->toBeTrue();
    expect(Networks::from('solana-devnet')->supports(NetworkType::Solana))->toBeTrue();
    expect(Networks::from('solana')->supports(NetworkType::Evm))->toBeFalse();
});

test('network returns correct usdc address', function () {
    // EVM Mainnets
    expect(Networks::from('base')->address)->toBe('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
    expect(Networks::from('polygon')->address)->toBe('0x3c499c542cef5e3811e1192ce70d8cc03d5c3359');
    expect(Networks::from('sei')->address)->toBe('0xe15fc38f6d8c56af07bbcbe3baf5708a2bf42392');

    // EVM Testnets
    expect(Networks::from('base-sepolia')->address)->toBe('0x036CbD53842c5426634e7929541eC2318f3dCF7e');
    expect(Networks::from('polygon-amoy')->address)->toBe('0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582');

    // Solana (base58 addresses)
    expect(Networks::from('solana')->address)->toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    expect(Networks::from('solana-devnet')->address)->toBe('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
});

test('network returns correct usdc name', function () {
    expect(Networks::from('base')->name)->toBe('USD Coin');
    expect(Networks::from('polygon')->name)->toBe('USD Coin');
    expect(Networks::from('base-sepolia')->name)->toBe('USDC');
    expect(Networks::from('sei')->name)->toBe('USDC');
    expect(Networks::from('iotex')->name)->toBe('Bridged USDC');
    expect(Networks::from('educhain')->name)->toBe('Bridged USDC (Stargate)');
    expect(Networks::from('skale-base-sepolia')->name)->toBe('Bridged USDC (SKALE Bridge)');
});

test('networks from returns network by value', function () {
    $network = Networks::from('base-sepolia');

    expect($network)->toBeInstanceOf(Network::class);
    expect($network->value)->toBe('base-sepolia');
});

test('networks from throws on unknown network', function () {
    Networks::from('unknown-network');
})->throws(InvalidArgumentException::class, 'Unknown network: unknown-network');

test('networks all returns all registered networks', function () {
    $all = Networks::all();

    expect($all)->toBeArray();
    expect(count($all))->toBeGreaterThanOrEqual(17);
    expect($all['base'])->toBeInstanceOf(Network::class);
});

test('networks of type returns filtered networks', function () {
    $evm = Networks::ofType(NetworkType::Evm);
    $solana = Networks::ofType(NetworkType::Solana);

    expect(count($evm))->toBeGreaterThanOrEqual(15);
    expect(count($solana))->toBeGreaterThanOrEqual(2);

    foreach ($evm as $network) {
        expect($network->supports(NetworkType::Evm))->toBeTrue();
    }

    foreach ($solana as $network) {
        expect($network->supports(NetworkType::Solana))->toBeTrue();
    }
});

test('custom network can be registered', function () {
    $custom = new Network(
        value: 'custom-test',
        chainId: 99999,
        type: NetworkType::Evm,
        address: '0x1234567890123456789012345678901234567890',
        name: 'Custom USDC',
        testnet: true,
    );

    Networks::register($custom);

    $retrieved = Networks::from('custom-test');
    expect($retrieved->chainId)->toBe(99999);
    expect($retrieved->name)->toBe('Custom USDC');
});
