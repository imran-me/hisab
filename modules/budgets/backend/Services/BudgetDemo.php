<?php

namespace Hisab\Budgets\Services;

use App\Models\User;
use Hisab\Budgets\Models\Budget;
use Illuminate\Support\Facades\DB;

/**
 * Demo budgets, so the Budgets screen and Home's rings have something to show.
 *
 * Sized against the ledger's demo month (modules/ledger/backend/Services/
 * DemoData.php) so all three states appear: groceries and dining run close,
 * transport is comfortable, subscriptions is over because the demo's dollar
 * hosting charge lands in it too.
 */
class BudgetDemo
{
    /** category key => whole taka */
    private const LIMITS = [
        'groceries' => 12_000,
        'transport' => 3_500,
        'dining' => 3_000,
        'utilities' => 2_500,
        'internet' => 1_500,
        'subscriptions' => 1_500,
    ];

    public static function generate(User $owner): int
    {
        $categories = DB::table('categories')
            ->where('user_id', $owner->id)->where('book', 'personal')->where('type', 'expense')
            ->whereIn('key', array_keys(self::LIMITS))
            ->get(['id', 'key', 'book']);

        $made = 0;
        foreach ($categories as $category) {
            // Never over a budget the owner set themselves.
            $exists = Budget::query()->where('user_id', $owner->id)->where('category_id', $category->id)->exists();
            if ($exists) {
                continue;
            }

            Budget::query()->create([
                'user_id' => $owner->id,
                'category_id' => $category->id,
                'book' => $category->book,
                'amount_minor' => self::LIMITS[$category->key] * 100,
                'currency' => 'BDT',
                'is_demo' => true,
            ]);
            $made++;
        }

        return $made;
    }

    public static function purge(User $owner): int
    {
        return Budget::query()->where('user_id', $owner->id)->where('is_demo', true)->delete();
    }
}
