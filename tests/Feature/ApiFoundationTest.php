<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * The shape of the backend, rather than any one feature of it.
 *
 * These assertions look almost too small to be worth writing. They are here
 * because each one pins a decision that is invisible in the code and expensive
 * to discover breaking in production: that Laravel answers only under /api,
 * that it never renders a page, and that a failure comes back as JSON rather
 * than as an HTML error document a fetch() cannot read.
 */
class ApiFoundationTest extends TestCase
{
    public function test_health_answers_in_the_documented_envelope(): void
    {
        // Two things at once. api-contract.md §2: every successful response is
        // an object with a `data` key. And the PATH: http.js probes exactly
        // this to decide whether a backend exists, so if this route is ever
        // renamed the frontend silently falls back to browser storage.
        $this->getJson('/api/health')
            ->assertOk()
            ->assertExactJson(['data' => ['ok' => true]]);
    }

    public function test_the_site_root_is_not_served_by_laravel(): void
    {
        // The frontend is static HTML served by the web server. If this ever
        // starts returning 200, something has added a web route and created a
        // second, unprotected way into the app - see routes/web.php.
        $this->get('/')->assertNotFound();
    }

    public function test_an_unknown_api_route_fails_as_json_not_html(): void
    {
        // api.js parses every response as JSON. An HTML error document here
        // surfaces to the user as a parse error rather than as the 404 it is.
        $response = $this->getJson('/api/no-such-route');

        $response->assertNotFound();
        $this->assertStringContainsString('application/json', (string) $response->headers->get('Content-Type'));
    }

    public function test_a_guest_hitting_a_protected_api_route_gets_401_not_a_redirect(): void
    {
        // Deliberately a PLAIN get(), with no Accept or X-Requested-With - a
        // browser address bar, not fetch(). Laravel sends guests to a route
        // named `login`, which this app does not have (the sign-in screen is a
        // static file), so the redirect threw and turned a clean 401 into a 500.
        //
        // getJson() would pass whether this were fixed or not, which is exactly
        // why it is not used here.
        $this->get('/api/ledger')->assertUnauthorized();
        $this->get('/api/accounts')->assertUnauthorized();
    }

    public function test_the_health_endpoint_is_up(): void
    {
        // Laravel's own /up, used by uptime checks. Kept because it costs
        // nothing and answers before any module is loaded.
        $this->get('/up')->assertOk();
    }
}
