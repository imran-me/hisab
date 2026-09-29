<?php

namespace Hisab\Vault;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

/**
 * The vault's server half: encrypted blobs and one header per owner. The
 * browser half - the cryptography - is api.js, crypto.js and session.js in
 * this same folder; the server never runs any of it.
 */
class VaultServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        $this->loadMigrationsFrom(__DIR__.'/Migrations');

        // Named, so each keeps its own count. Plain throttle:N,1 limits all
        // share one key per user, and stacking two counted every request twice.
        // The header is what an unlock reads, so it is held far tighter.
        RateLimiter::for('vault-header', fn (Request $request): Limit => Limit::perMinute(20)
            ->by((string) ($request->user()?->id ?: $request->ip())));
        RateLimiter::for('vault', fn (Request $request): Limit => Limit::perMinute(240)
            ->by((string) ($request->user()?->id ?: $request->ip())));

        Route::middleware('api')
            ->prefix('api')
            ->group(__DIR__.'/routes.php');
    }
}
