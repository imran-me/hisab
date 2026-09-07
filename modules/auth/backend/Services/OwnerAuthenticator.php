<?php

namespace Hisab\Auth\Services;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;

/**
 * Signing the owner in, and the two things about it that are easy to get wrong.
 *
 * This is a Service and not logic in the controller because CONVENTIONS.md puts
 * every rule in one, but also because both rules below are the kind that get
 * quietly dropped when someone "simplifies" a controller later. Stated here,
 * with the reasoning, they are harder to delete by accident.
 */
class OwnerAuthenticator
{
    /**
     * A hash of a password nobody has, used only to burn the same amount of CPU
     * when the email matches nothing as when it matches something.
     *
     * Without it, "no such account" returns in about a millisecond while "wrong
     * password" takes the ~100ms bcrypt costs at 12 rounds. That gap is
     * measurable over the network, so an attacker learns which email addresses
     * exist — exactly what the deliberately vague message in endpoints.md
     * refuses to tell them. A generic message with a non-generic response time
     * is not generic.
     *
     * Computed rather than hardcoded, so it always carries the CONFIGURED cost.
     * A literal baked in at 12 rounds would stop matching the real work the
     * moment BCRYPT_ROUNDS changed, and the leak would reopen silently.
     * Memoised per process: the cost has to be paid on a miss, not on boot.
     */
    private static ?string $dummyHash = null;

    /**
     * @return bool True when the session is now authenticated.
     */
    public function attempt(Request $request, string $email, string $password, bool $remember): bool
    {
        $user = User::query()->where('email', $email)->first();

        if ($user === null) {
            // Deliberately does nothing with the result. See $dummyHash.
            Hash::check($password, self::dummyHash());

            return false;
        }

        if (! Hash::check($password, $user->password)) {
            return false;
        }

        Auth::login($user, $remember);

        // Session fixation: a session id issued BEFORE authentication must not
        // remain valid after it. Anyone able to set or observe the pre-login id
        // — a shared machine, a link with a session id in it, an XSS that read
        // the cookie before the vault was involved — would otherwise be holding
        // a signed-in session the moment the owner logs in.
        $request->session()->regenerate();

        // Rehash if the cost factor has since been raised, so an old account
        // does not keep a weaker hash forever. Silent by design.
        if (Hash::needsRehash($user->password)) {
            $user->forceFill(['password' => Hash::make($password)])->save();
        }

        return true;
    }

    private static function dummyHash(): string
    {
        return self::$dummyHash ??= Hash::make('no account holds this password');
    }

    public function logout(Request $request): void
    {
        Auth::guard('web')->logout();

        // Both, and in this order. invalidate() drops the server-side session
        // so a replayed cookie is worthless; regenerateToken() stops the old
        // CSRF token from being reused against the next session.
        $request->session()->invalidate();
        $request->session()->regenerateToken();
    }
}
