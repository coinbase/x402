<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Facilitator URL
    |--------------------------------------------------------------------------
    |
    | The URL of the x402 facilitator service that handles payment verification
    | and settlement. The default points to the official x402.org facilitator.
    |
    */
    'facilitator_url' => env('X402_FACILITATOR_URL', 'https://x402.org/facilitator'),

    /*
    |--------------------------------------------------------------------------
    | Pay To Address
    |--------------------------------------------------------------------------
    |
    | The wallet address where payments will be sent. This is required and
    | must be set either here or via the X402_PAY_TO environment variable.
    |
    */
    'pay_to' => env('X402_PAY_TO'),

    /*
    |--------------------------------------------------------------------------
    | Network
    |--------------------------------------------------------------------------
    |
    | The blockchain network to use for payments. Defaults to 'base-sepolia'
    | for testnet. Use 'base' for mainnet.
    |
    */
    'network' => env('X402_NETWORK', 'base-sepolia'),

    /*
    |--------------------------------------------------------------------------
    | Description
    |--------------------------------------------------------------------------
    |
    | A default description for payment requests. This will be shown to users
    | when they are prompted to make a payment.
    |
    */
    'description' => env('X402_DESCRIPTION'),

    /*
    |--------------------------------------------------------------------------
    | Paywall Configuration
    |--------------------------------------------------------------------------
    |
    | Configure the paywall UI that is shown to browser users when they
    | need to make a payment. Set 'enabled' to false to always return
    | JSON responses instead of the HTML paywall.
    |
    */
    'paywall' => [
        'enabled' => env('X402_PAYWALL_ENABLED', true),
        'cdp_client_key' => env('X402_CDP_CLIENT_KEY', ''),
        'app_name' => env('X402_APP_NAME'),
        'app_logo' => env('X402_APP_LOGO', ''),
        'session_token_endpoint' => env('X402_SESSION_TOKEN_ENDPOINT', ''),
    ],
];
