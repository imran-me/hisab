<?php

namespace Hisab\Auth\Controllers;

use App\Http\Controllers\Controller;
use Hisab\Auth\Requests\LoginRequest;
use Hisab\Auth\Services\OwnerAuthenticator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * The session, as a resource: show it, create it, destroy it.
 *
 * Thin by requirement — HTTP shaping only. Every rule is in OwnerAuthenticator.
 */
class SessionController extends Controller
{
    public function __construct(private readonly OwnerAuthenticator $auth)
    {
    }

    /**
     * ALWAYS 200, signed in or not.
     *
     * This is what the app calls on boot to decide which screen to draw. A 401
     * here would be indistinguishable from a real authorisation failure on a
     * data route, and http.js would have to special-case the one endpoint whose
     * 401 does not mean "your session ended".
     *
     * It is also what issues the XSRF-TOKEN cookie that every write echoes back.
     */
    public function show(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->state($request)]);
    }

    public function store(LoginRequest $request): JsonResponse
    {
        $ok = $this->auth->attempt(
            $request,
            (string) $request->string('email'),
            (string) $request->string('password'),
            (bool) $request->boolean('remember'),
        );

        if (! $ok) {
            // One message, whatever went wrong: no such account, wrong password,
            // anything else. Thrown as a validation error so the form can mark
            // the field, and attached to `email` because that is the field the
            // person can actually check.
            throw ValidationException::withMessages([
                'email' => __('Those details do not match.'),
            ])->status(422);
        }

        return response()->json(['data' => $this->state($request)]);
    }

    /**
     * 204, always — including when nobody was signed in.
     *
     * A logout that can fail is a logout that leaves someone signed in on a
     * shared device while showing them an error they cannot act on.
     */
    public function destroy(Request $request): JsonResponse
    {
        $this->auth->logout($request);

        return response()->json(null, 204);
    }

    /**
     * @return array<string, mixed>
     */
    private function state(Request $request): array
    {
        $user = $request->user();

        return [
            'authenticated' => $user !== null,
            'user' => $user === null ? null : [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
            ],
        ];
    }
}
