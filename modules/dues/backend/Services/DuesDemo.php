<?php

namespace Hisab\Dues\Services;

use App\Models\User;
use Hisab\Dues\Models\DuePerson;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Demo dues: someone who owes you, someone you owe, and one settled, so the
 * Dues screen shows all three states and the Ledger shows the transfers.
 */
class DuesDemo
{
    public function __construct(private readonly DueBook $dues)
    {
    }

    public function generate(User $owner): int
    {
        $cash = DB::table('accounts')->where('user_id', $owner->id)->where('name', 'Cash in hand')->first();
        $bkash = DB::table('accounts')->where('user_id', $owner->id)->where('name', 'bKash')->first() ?? $cash;

        if ($cash === null || DuePerson::query()->where('user_id', $owner->id)->where('is_demo', true)->exists()) {
            return 0;
        }

        $day = fn (int $ago): string => Carbon::now()->subDays($ago)->toDateString();
        $made = 0;

        $plan = [
            ['Rahim (cousin)', '01711000111', $day(1), [
                ['lent', 8_000, $bkash->id, 40, 'For his shop rent'],
                ['got_back', 3_000, $cash->id, 12, null],
                ['lent', 2_000, $cash->id, 3, 'Medicine'],
            ]],
            ['Karim bhai', '01819000222', $day(-5), [
                ['borrowed', 15_000, $cash->id, 25, 'Short for the rent'],
                ['paid_back', 5_000, $bkash->id, 6, null],
            ]],
            ['Office canteen', null, null, [
                ['borrowed', 650, $cash->id, 9, 'Lunch on credit'],
                ['paid_back', 650, $cash->id, 2, null],
            ]],
        ];

        foreach ($plan as [$name, $phone, $remind, $entries]) {
            $person = DuePerson::query()->create([
                'user_id' => $owner->id, 'book' => 'personal', 'name' => $name,
                'phone' => $phone, 'remind_on' => $remind, 'is_demo' => true,
            ]);

            foreach ($entries as [$kind, $taka, $account, $ago, $note]) {
                $this->dues->record($owner, $person, [
                    'kind' => $kind, 'amount_minor' => $taka * 100, 'account_id' => $account,
                    'occurred_on' => $day($ago), 'note' => $note, 'is_demo' => true,
                ]);
                $made++;
            }
        }

        return $made;
    }

    /** The ledger's purge removes the demo transfers; their entries cascade. */
    public static function purge(User $owner): int
    {
        return DuePerson::query()->where('user_id', $owner->id)->where('is_demo', true)->delete();
    }
}
