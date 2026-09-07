<?php

namespace Hisab\Auth\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Validation only. Whether the details are CORRECT is the authenticator's job,
 * and keeping that out of here is what allows one message for every kind of
 * failure — see endpoints.md.
 */
class LoginRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Signing in is what this route is for.
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            // Format only, and deliberately no `exists` rule: a validator that
            // reports "this email is not registered" is a working account
            // enumeration endpoint.
            'email' => ['required', 'string', 'email', 'max:255'],

            // No complexity rules on the way IN. They belong where a password is
            // SET (hisab:owner), not where one is checked — a minimum length
            // here just tells an attacker which candidates not to bother with.
            // The maximum is bcrypt's own 72-byte input limit, stated so a long
            // passphrase fails as validation rather than being silently
            // truncated to something shorter than the owner believes.
            'password' => ['required', 'string', 'max:72'],

            'remember' => ['sometimes', 'boolean'],
        ];
    }
}
