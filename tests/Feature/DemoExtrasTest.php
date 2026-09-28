<?php

namespace Tests\Feature;

use App\Models\User;
use Hisab\Budgets\Models\Budget;
use Hisab\Budgets\Models\Goal;
use Hisab\Dues\Models\DuePerson;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Settings' "Demo data" button (POST / DELETE /api/ledger/demo) brings demo
 * budgets, goals and dues with it and takes exactly those away again, the
 * same as `hisab:demo` - without either the ledger's controller or the
 * Settings screen naming these modules.
 */
class DemoExtrasTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_settings_button_adds_and_removes_budgets_goals_and_dues(): void
    {
        $this->seed();
        $owner = User::query()->create(['name' => 'O', 'email' => 'o@example.test', 'password' => Hash::make('x')]);

        $this->actingAs($owner)->postJson('/api/ledger/demo')->assertSuccessful();

        $this->assertSame(6, Budget::query()->where('user_id', $owner->id)->where('is_demo', true)->count());
        $this->assertSame(2, Goal::query()->where('user_id', $owner->id)->where('is_demo', true)->count());
        $this->assertSame(3, DuePerson::query()->where('user_id', $owner->id)->where('is_demo', true)->count());

        // Something the owner set themselves survives the removal.
        Budget::query()->where('user_id', $owner->id)->first()->forceFill(['is_demo' => false])->save();

        $this->deleteJson('/api/ledger/demo')->assertSuccessful();

        $this->assertSame(1, Budget::query()->where('user_id', $owner->id)->count());
        $this->assertSame(0, Goal::query()->where('user_id', $owner->id)->count());
        $this->assertSame(0, DuePerson::query()->where('user_id', $owner->id)->count());
    }

    public function test_a_refused_second_press_adds_nothing(): void
    {
        $this->seed();
        $owner = User::query()->create(['name' => 'O', 'email' => 'o@example.test', 'password' => Hash::make('x')]);

        $this->actingAs($owner)->postJson('/api/ledger/demo')->assertSuccessful();
        $this->postJson('/api/ledger/demo')->assertStatus(409);

        $this->assertSame(3, DuePerson::query()->where('user_id', $owner->id)->count());
        $this->assertSame(2, Goal::query()->where('user_id', $owner->id)->count());
    }
}
