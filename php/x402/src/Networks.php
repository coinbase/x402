<?php

declare(strict_types=1);

namespace X402;

use InvalidArgumentException;
use X402\Enum\NetworkType;
use X402\Value\Network;

final class Networks
{
    /** @var array<string, Network> */
    private static array $registry = [];

    private static bool $initialized = false;

    public static function from(string $value): Network
    {
        self::initialize();

        return self::$registry[$value]
            ?? throw new InvalidArgumentException("Unknown network: {$value}");
    }

    public static function register(Network $network): void
    {
        self::$registry[$network->value] = $network;
    }

    /** @return array<string, Network> */
    public static function all(): array
    {
        self::initialize();

        return self::$registry;
    }

    /** @return Network[] */
    public static function ofType(NetworkType $type): array
    {
        self::initialize();

        return self::$registry
            |> (fn($arr): array => array_filter($arr, fn(Network $n): bool => $n->supports($type)))
            |> array_values(...);
    }

    private static function initialize(): void
    {
        if (self::$initialized) {
            return;
        }

        self::$initialized = true;

        // EVM Mainnets
        self::register(new Network(
            value: 'base',
            chainId: 8453,
            type: NetworkType::Evm,
            address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
            name: 'USD Coin',
        ));

        self::register(new Network(
            value: 'avalanche',
            chainId: 43114,
            type: NetworkType::Evm,
            address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
            name: 'USD Coin',
        ));

        self::register(new Network(
            value: 'polygon',
            chainId: 137,
            type: NetworkType::Evm,
            address: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
            name: 'USD Coin',
        ));

        self::register(new Network(
            value: 'sei',
            chainId: 1329,
            type: NetworkType::Evm,
            address: '0xe15fc38f6d8c56af07bbcbe3baf5708a2bf42392',
            name: 'USDC',
        ));

        self::register(new Network(
            value: 'iotex',
            chainId: 4689,
            type: NetworkType::Evm,
            address: '0xcdf79194c6c285077a58da47641d4dbe51f63542',
            name: 'Bridged USDC',
        ));

        self::register(new Network(
            value: 'peaq',
            chainId: 3338,
            type: NetworkType::Evm,
            address: '0xbbA60da06c2c5424f03f7434542280FCAd453d10',
            name: 'USDC',
        ));

        self::register(new Network(
            value: 'story',
            chainId: 1514,
            type: NetworkType::Evm,
            address: '0xF1815bd50389c46847f0Bda824eC8da914045D14',
            name: 'Bridged USDC',
        ));

        self::register(new Network(
            value: 'educhain',
            chainId: 41923,
            type: NetworkType::Evm,
            address: '0x12a272A581feE5577A5dFa371afEB4b2F3a8C2F8',
            name: 'Bridged USDC (Stargate)',
        ));

        self::register(new Network(
            value: 'abstract',
            chainId: 2741,
            type: NetworkType::Evm,
            address: '0x84a71ccd554cc1b02749b35d22f684cc8ec987e1',
            name: 'Bridged USDC',
        ));

        // EVM Testnets
        self::register(new Network(
            value: 'base-sepolia',
            chainId: 84532,
            type: NetworkType::Evm,
            address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
            name: 'USDC',
            testnet: true,
        ));

        self::register(new Network(
            value: 'avalanche-fuji',
            chainId: 43113,
            type: NetworkType::Evm,
            address: '0x5425890298aed601595a70AB815c96711a31Bc65',
            name: 'USD Coin',
            testnet: true,
        ));

        self::register(new Network(
            value: 'polygon-amoy',
            chainId: 80002,
            type: NetworkType::Evm,
            address: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
            name: 'USDC',
            testnet: true,
        ));

        self::register(new Network(
            value: 'sei-testnet',
            chainId: 1328,
            type: NetworkType::Evm,
            address: '0x4fcf1784b31630811181f670aea7a7bef803eaed',
            name: 'USDC',
            testnet: true,
        ));

        self::register(new Network(
            value: 'abstract-testnet',
            chainId: 11124,
            type: NetworkType::Evm,
            address: '0xe4C7fBB0a626ed208021ccabA6Be1566905E2dFc',
            name: 'Bridged USDC',
            testnet: true,
        ));

        self::register(new Network(
            value: 'skale-base-sepolia',
            chainId: 324705682,
            type: NetworkType::Evm,
            address: '0x2e08028E3C4c2356572E096d8EF835cD5C6030bD',
            name: 'Bridged USDC (SKALE Bridge)',
            testnet: true,
        ));

        // Solana
        self::register(new Network(
            value: 'solana',
            chainId: 101,
            type: NetworkType::Solana,
            address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            name: 'USDC',
        ));

        self::register(new Network(
            value: 'solana-devnet',
            chainId: 103,
            type: NetworkType::Solana,
            address: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
            name: 'USDC',
            testnet: true,
        ));
    }
}
