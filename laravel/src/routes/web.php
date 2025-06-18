<?php

use Illuminate\Support\Facades\Route;

Route::middleware(['x402'])->get('/demo-protected', function () {
    return response()->json(['message' => 'Payment accepted!']);
});

