<?php

declare(strict_types=1);

namespace Coinbase\X402\Laravel\Tests\Feature;

use Orchestra\Testbench\TestCase;
use Illuminate\Support\Facades\Route;
use Coinbase\X402\Laravel\X402ServiceProvider;
use Coinbase\X402\Laravel\Middleware\EnforcePayment;

class EnforcePaymentTest extends TestCase
{
    protected function getPackageProviders($app)
    {
        return [X402ServiceProvider::class];
    }

    protected function defineRoutes($router)
    {
        $router->aliasMiddleware('x402', EnforcePayment::class);
        $router->get('/protected', function () {
            return response()->json(['message' => 'ok']);
        })->middleware('x402');
    }

    /** @test */
    public function it_returns_402_if_payment_is_missing()
    {
        $response = $this->get('/protected');
        $response->assertStatus(402);
        $response->assertJson([
            'error' => 'Payment Required',
        ]);
    }

    /** @test */
    public function it_allows_access_with_valid_payment()
    {
        // TODO: Simulate a request with a valid payment header/body
        // $response = $this->get('/protected', [...]);
        // $response->assertStatus(200);
        // $response->assertJson(['message' => 'ok']);
        $this->markTestIncomplete('Not implemented: happy path for valid payment.');
    }

    /** @test */
    public function it_returns_402_for_expired_nonce()
    {
        // TODO: Simulate a request with an expired nonce
        // $response = $this->get('/protected', [...]);
        // $response->assertStatus(402);
        // $response->assertJson(['error' => 'Expired nonce']);
        $this->markTestIncomplete('Not implemented: expired nonce.');
    }

    /** @test */
    public function it_returns_402_for_replay_attack()
    {
        // TODO: Simulate a replayed payment (same nonce used twice)
        // $response = $this->get('/protected', [...]);
        // $response->assertStatus(402);
        // $response->assertJson(['error' => 'Replay attack detected']);
        $this->markTestIncomplete('Not implemented: replay attack.');
    }

    /** @test */
    public function it_returns_402_for_insufficient_amount()
    {
        // TODO: Simulate a request with insufficient payment amount
        // $response = $this->get('/protected', [...]);
        // $response->assertStatus(402);
        // $response->assertJson(['error' => 'Insufficient amount']);
        $this->markTestIncomplete('Not implemented: insufficient amount.');
    }

    /** @test */
    public function it_returns_402_for_gas_spike_abort()
    {
        // TODO: Simulate a request where gas price exceeds allowed max
        // $response = $this->get('/protected', [...]);
        // $response->assertStatus(402);
        // $response->assertJson(['error' => 'Gas price too high']);
        $this->markTestIncomplete('Not implemented: gas spike abort.');
    }

    // Add more tests for:
    // - Valid payment (happy path)
    // - Expired nonce
    // - Replay attack
    // - Insufficient amount
    // - Gas spike abort
}