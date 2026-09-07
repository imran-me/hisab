<?php

namespace Hisab\Auth;

use Hisab\Auth\Commands\OwnerCommand;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

/**
 * The auth module's single point of contact with the application.
 *
 * Along with the PSR-4 line in composer.json, this class is one of the only two
 * places CONVENTIONS.md allows a module to be named from outside its own folder.
 * Everything the module contributes — routes, rate limiters, commands — is
 * registered from here, so removing the module's line from
 * bootstrap/providers.php and deleting the folder removes the feature whole.
 */
class AuthServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        $this->registerRateLimiters();

        Route::middleware('api')
            ->prefix('api')
            ->group(__DIR__.'/routes.php');

        if ($this->app->runningInConsole()) {
            $this->commands([OwnerCommand::class]);
        }
    }

    /**
     * Login throttling, far below the application default.
     *
     * CONVENTIONS.md: "Rate-limit anything guessable (login, vault unlock, TOTP)
     * far below the app default." A password is guessable by definition, and
     * this app has exactly one account to guess at, so the useful limit is very
     * low — a person who has forgotten their own password does not need fifty
     * attempts a minute, and an attacker very much does.
     */
    private function registerRateLimiters(): void
    {
        // Per email+IP pair: stops a sustained attack on the one account that
        // exists, without letting an attacker lock the owner out from elsewhere.
        RateLimiter::for('login-identity', function (Request $request): Limit {
            $email = strtolower((string) $request->input('email'));

            return Limit::perMinute(5)->by($email.'|'.$request->ip());
        });

        // Per IP, over a longer window. Catches the case the pair limiter
        // misses: one host walking through a list of candidate emails, five a
        // minute at a time, never repeating the pair.
        RateLimiter::for('login-ip', function (Request $request): Limit {
            return Limit::perHour(20)->by('login-ip|'.$request->ip());
        });
    }
}
