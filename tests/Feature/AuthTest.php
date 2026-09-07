<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * The auth module.
 *
 * NOTE ON CSRF: Laravel's ValidateCsrfToken middleware short-circuits when
 * `runningUnitTests()` is true, so a feature test cannot observe a 419 — it
 * would pass whether the middleware were wired up or not, which is worse than
 * no test. CSRF is therefore verified over real HTTP instead, against
 * `artisan serve`, and that result is recorded in docs/STATUS.md.
 */
class AuthTest extends TestCase
{
    use RefreshDatabase;

    private function owner(string $password = 'a correct horse battery staple'): User
    {
        return User::query()->create([
            'name' => 'Md Imran Hossain',
            'email' => 'owner@example.test',
            'password' => Hash::make($password),
        ]);
    }

    public function test_session_is_readable_while_signed_out_and_says_so(): void
    {
        // 200 and not 401: the app calls this on boot to choose a screen.
        $this->getJson('/api/auth/session')
            ->assertOk()
            ->assertExactJson(['data' => ['authenticated' => false, 'user' => null]]);
    }

    public function test_the_owner_can_sign_in(): void
    {
        $owner = $this->owner();

        $this->postJson('/api/auth/login', [
            'email' => 'owner@example.test',
            'password' => 'a correct horse battery staple',
        ])->assertOk()->assertJsonPath('data.authenticated', true)
          ->assertJsonPath('data.user.email', 'owner@example.test');

        $this->assertAuthenticatedAs($owner);
    }

    public function test_the_public_id_is_a_ulid_not_a_number(): void
    {
        $this->owner();

        $id = $this->postJson('/api/auth/login', [
            'email' => 'owner@example.test',
            'password' => 'a correct horse battery staple',
        ])->json('data.user.id');

        // CONVENTIONS.md: public keys are ULIDs, never auto-increment ids.
        $this->assertMatchesRegularExpression('/^[0-9A-HJKMNP-TV-Z]{26}$/', (string) $id);
    }

    public function test_a_wrong_password_is_rejected_without_signing_in(): void
    {
        $this->owner();

        $this->postJson('/api/auth/login', [
            'email' => 'owner@example.test',
            'password' => 'not the password',
        ])->assertStatus(422)->assertJsonValidationErrors('email');

        $this->assertGuest();
    }

    public function test_an_unknown_email_fails_identically_to_a_wrong_password(): void
    {
        $this->owner();

        $wrongPassword = $this->postJson('/api/auth/login', [
            'email' => 'owner@example.test',
            'password' => 'not the password',
        ]);

        $noSuchAccount = $this->postJson('/api/auth/login', [
            'email' => 'nobody@example.test',
            'password' => 'not the password',
        ]);

        // The whole point: an attacker must not be able to tell these apart, so
        // the status AND the body have to match exactly. If someone ever adds a
        // friendlier "no account with that email" message, this fails.
        $this->assertSame($wrongPassword->status(), $noSuchAccount->status());
        $this->assertSame($wrongPassword->json(), $noSuchAccount->json());
    }

    public function test_signing_in_regenerates_the_session_id(): void
    {
        $this->owner();

        $this->get('/api/auth/session');
        $before = session()->getId();

        $this->postJson('/api/auth/login', [
            'email' => 'owner@example.test',
            'password' => 'a correct horse battery staple',
        ])->assertOk();

        // Session fixation: an id issued before authentication must not still be
        // valid after it.
        $this->assertNotSame($before, session()->getId());
    }

    public function test_logout_ends_the_session_and_answers_204(): void
    {
        $owner = $this->owner();

        $this->actingAs($owner)->postJson('/api/auth/logout')->assertNoContent();

        $this->assertGuest();
        $this->getJson('/api/auth/session')->assertJsonPath('data.authenticated', false);
    }

    public function test_logout_succeeds_even_when_not_signed_in(): void
    {
        // A logout that can fail is a logout that leaves someone signed in on a
        // shared device while showing an error they cannot act on.
        $this->postJson('/api/auth/logout')->assertNoContent();
    }

    public function test_login_is_rate_limited_far_below_the_app_default(): void
    {
        $this->owner();

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/login', [
                'email' => 'owner@example.test',
                'password' => 'wrong',
            ])->assertStatus(422);
        }

        // Six in a minute against one account is not a person who forgot.
        $this->postJson('/api/auth/login', [
            'email' => 'owner@example.test',
            'password' => 'wrong',
        ])->assertStatus(429);
    }

    public function test_the_limiter_does_not_lock_the_owner_out_from_a_different_address(): void
    {
        $this->owner();

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/login', [
                'email' => 'owner@example.test',
                'password' => 'wrong',
            ])->assertStatus(422);
        }

        // Keyed on email AND ip together, so an attacker hammering the owner's
        // address from elsewhere must not lock the owner out of their own app.
        $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.9'])
            ->postJson('/api/auth/login', [
                'email' => 'owner@example.test',
                'password' => 'a correct horse battery staple',
            ])->assertOk();
    }
}
