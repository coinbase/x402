<?php

declare(strict_types=1);

namespace Coinbase\X402\Laravel\Middleware;

use Closure;
use Coinbase\X402\Client;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnforcePayment
{
    public function handle(Request $request, Closure $next)
    {
        $payment = $request->header('X-PAYMENT');

        if (!$payment) {
            return response()->json([
                'error' => 'Payment Required',
                // 'accepts' => ... // Optionally include requirements
            ], 402);
        }

        // TODO: Replace with real decoding/validation using the PHP SDK
        switch ($payment) {
            case 'expired-nonce':
                return response()->json(['error' => 'Expired nonce'], 402);
            case 'replay-attack':
                return response()->json(['error' => 'Replay attack detected'], 402);
            case 'insufficient-amount':
                return response()->json(['error' => 'Insufficient amount'], 402);
            case 'gas-spike':
                return response()->json(['error' => 'Gas price too high'], 402);
            case 'valid-payment':
                // Simulate a valid payment
                break;
            default:
                return response()->json(['error' => 'Invalid or malformed payment header'], 402);
        }

        // If all checks pass, allow the request through
        return $next($request);
    }
}