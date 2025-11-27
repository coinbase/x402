<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| x402 Discovery Endpoint (Bazaar)
|--------------------------------------------------------------------------
|
| Register the discovery endpoint so clients can find all paid resources.
| Default path: GET /discovery/resources
|
*/
Route::x402Discovery();

/*
|--------------------------------------------------------------------------
| Free Endpoints
|--------------------------------------------------------------------------
*/
Route::get('/free', function () {
    return response()->json([
        'message' => 'This endpoint is free!',
        'timestamp' => now()->toIso8601String(),
    ]);
});

/*
|--------------------------------------------------------------------------
| Paid Endpoints (using the paid() route macro)
|--------------------------------------------------------------------------
|
| These routes use the new Laravel-native ->paid() macro.
| Payment requirements are automatically discovered by the Bazaar.
|
*/

// Weather API - $0.001 (uses config defaults for pay_to and network)
Route::get('/weather', function (Request $request) {
    return response()->json([
        'location' => 'San Francisco, CA',
        'temperature' => 68,
        'unit' => 'fahrenheit',
        'conditions' => 'Partly cloudy',
        'payer' => $request->payer(),
    ]);
})->paid('0.001');

// Premium content - $0.01
Route::get('/premium', function (Request $request) {
    return response()->json([
        'data' => [
            'secret' => 'This is premium content worth $0.01',
            'timestamp' => now()->toIso8601String(),
        ],
        'payer' => $request->payer(),
        'requirements' => $request->requirements()?->toArray(),
    ]);
})->paid('0.01');

// Solana devnet endpoint - custom network and pay_to
Route::get('/solana-weather', function (Request $request) {
    return response()->json([
        'location' => 'San Francisco, CA',
        'temperature' => 68,
        'unit' => 'fahrenheit',
        'conditions' => 'Sunny',
        'network' => 'solana-devnet',
        'payer' => $request->payer(),
    ]);
})->paid('0.001', [
    'pay_to' => 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
    'network' => 'solana-devnet',
]);
