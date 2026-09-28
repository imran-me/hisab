<?php

namespace Hisab\Dues\Services;

use App\Models\User;
use Hisab\Accounts\Models\Account;
use Hisab\Dues\Models\DueEntry;
use Hisab\Dues\Models\DuePerson;
use Hisab\Ledger\Models\Transaction;
use Hisab\Ledger\Services\LedgerWriter;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Dues: recording them as real ledger transfers, and reading balances back
 * out of the ledger. The rule is in endpoints.md, "the counting rule".
 */
class DueBook
{
    public const ACCOUNT_TYPE = 'dues';

    public const CURRENCY = 'BDT';

    public function __construct(private readonly LedgerWriter $writer)
    {
    }

    /**
     * The book's Dues account, made on first use.
     *
     * One per book, held rather than spendable (Account::HELD_TYPES), so money
     * lent is still in net worth and never in what you can spend today.
     */
    public function account(User $user, string $book): Account
    {
        $existing = Account::query()
            ->where('user_id', $user->id)->where('book', $book)->where('type', self::ACCOUNT_TYPE)
            ->whereNull('archived_at')->first();

        if ($existing !== null) {
            return $existing;
        }

        return Account::query()->create([
            'id' => strtoupper((string) Str::ulid()),
            'user_id' => $user->id,
            'name' => 'Dues',
            'type' => self::ACCOUNT_TYPE,
            'currency' => self::CURRENCY,
            'book' => $book,
            'opening_balance_minor' => 0,
            'is_default' => false,
            'sort_order' => 95,
            'notes' => 'Money lent and borrowed, per person on the Dues screen.',
        ]);
    }

    /**
     * Record one due: the ledger transfer and the entry, both or neither.
     *
     * @param  array{kind:string, amount_minor:int, account_id:string, occurred_on?:string, note?:?string, is_demo?:bool}  $data
     */
    public function record(User $user, DuePerson $person, array $data): DueEntry
    {
        return DB::transaction(function () use ($user, $person, $data): DueEntry {
            $real = Account::query()
                ->where('user_id', $user->id)->where('id', $data['account_id'])
                ->whereNull('archived_at')->first();

            if ($real === null) {
                abort(404);
            }

            if ($real->book !== $person->book || $real->type === self::ACCOUNT_TYPE) {
                throw ValidationException::withMessages(['account_id' => __('Pick an account in the same book.')]);
            }

            $dues = $this->account($user, $person->book);

            if ($real->currency !== $dues->currency) {
                throw ValidationException::withMessages([
                    'account_id' => __('Dues are kept in :code. Use a :code account.', ['code' => $dues->currency]),
                ]);
            }

            $kind = $data['kind'];
            $intoDues = DueEntry::KINDS[$kind] > 0;   // lent, paid_back: money leaves your account
            $on = $data['occurred_on'] ?? Carbon::now()->toDateString();
            $isDemo = (bool) ($data['is_demo'] ?? false);

            $legs = $this->writer->create($user, [
                'type' => 'transfer',
                'account_id' => $intoDues ? $real->id : $dues->id,
                'to_account_id' => $intoDues ? $dues->id : $real->id,
                'amount_minor' => (int) $data['amount_minor'],
                'currency' => $dues->currency,
                'payee' => $person->name,
                'note' => $data['note'] ?? self::describe($kind, $person->name),
                'occurred_on' => $on,
                'book' => $person->book,
                'is_demo' => $isDemo,
            ]);

            $duesLeg = $legs->firstWhere('account_id', $dues->id);

            return DueEntry::query()->create([
                'user_id' => $user->id,
                'person_id' => $person->id,
                'kind' => $kind,
                'amount_minor' => (int) $data['amount_minor'],
                'currency' => $dues->currency,
                'occurred_on' => $on,
                'note' => $data['note'] ?? null,
                'account_id' => $real->id,
                'transaction_id' => $duesLeg->id,
                'is_demo' => $isDemo,
            ]);
        });
    }

    /**
     * Change a due's amount: reverse its transfer and record the new one, and
     * move the entry onto the new Dues leg - one database transaction.
     *
     * This is the ONLY way to correct a due (review round 8, H4). A
     * correction made in the Ledger wrote a mirror that cancelled the
     * person's leg and a replacement that belonged to no one, so ৳5,000 lent
     * and corrected to ৳6,000 read as "settled" while the Dues account held
     * ৳6,000. The ledger now refuses to correct a Dues leg (Track B) and
     * sends the person here.
     */
    public function change(User $user, DueEntry $entry, int $amount): DueEntry
    {
        return DB::transaction(function () use ($user, $entry, $amount): DueEntry {
            $leg = $this->standingLeg($user, $entry);

            if ($amount === $entry->amount_minor) {
                return $entry;
            }

            $this->writer->reverse($user, $leg, 'Amount changed on the Dues screen');

            $person = DuePerson::query()->findOrFail($entry->person_id);
            $intoDues = DueEntry::KINDS[$entry->kind] > 0;

            $legs = $this->writer->create($user, [
                'type' => 'transfer',
                'account_id' => $intoDues ? $entry->account_id : $leg->account_id,
                'to_account_id' => $intoDues ? $leg->account_id : $entry->account_id,
                'amount_minor' => $amount,
                'currency' => $entry->currency,
                'payee' => $person->name,
                'note' => $entry->note ?? self::describe($entry->kind, $person->name),
                'occurred_on' => $entry->occurred_on,
                'book' => $person->book,
                'is_demo' => $entry->is_demo,
            ]);

            $entry->forceFill([
                'amount_minor' => $amount,
                'transaction_id' => $legs->firstWhere('account_id', $leg->account_id)->id,
            ])->save();

            return $entry;
        });
    }

    /**
     * Undo a due: reverse its transfer. The entry stays, shown as reversed,
     * and the mirror nets the person's balance - the same trail a reversal
     * leaves anywhere else in the ledger.
     */
    public function undo(User $user, DueEntry $entry): void
    {
        DB::transaction(function () use ($user, $entry): void {
            $this->writer->reverse($user, $this->standingLeg($user, $entry), 'Undone on the Dues screen');
        });
    }

    /** The entry's Dues leg, refusing one already reversed. */
    private function standingLeg(User $user, DueEntry $entry): Transaction
    {
        $leg = Transaction::query()->where('user_id', $user->id)->findOrFail($entry->transaction_id);

        if (Transaction::query()->where('reverses_id', $leg->id)->exists()) {
            throw ValidationException::withMessages(['entry' => __('This due was already undone.')])->status(409);
        }

        return $leg;
    }

    /**
     * Settle the whole balance in one real entry, whichever way it runs.
     */
    public function settle(User $user, DuePerson $person, string $accountId, ?string $on = null): DueEntry
    {
        $balance = $this->balances($user, collect([$person]))[$person->id] ?? 0;

        if ($balance === 0) {
            throw ValidationException::withMessages(['person' => __(':name is already settled.', ['name' => $person->name])]);
        }

        $entry = $this->record($user, $person, [
            'kind' => $balance > 0 ? 'got_back' : 'paid_back',
            'amount_minor' => abs($balance),
            'account_id' => $accountId,
            'occurred_on' => $on,
            'note' => 'Settled in full',
            'is_demo' => $person->is_demo,
        ]);

        // Nothing is owed, so there is nothing to be reminded about.
        $person->forceFill(['remind_on' => null])->save();

        return $entry;
    }

    /**
     * Each person's balance, read from the ledger: what they owe you when
     * positive, what you owe them when negative.
     *
     * The sum of the Dues account's legs for each person's entries, AND of any
     * reversal mirrors of those legs - a mirror runs the other way, so a due
     * reversed in the Ledger nets to nothing here without a special case.
     *
     * @param  Collection<int, DuePerson>  $people
     * @return array<string, int>  person id => balance in minor units
     */
    public function balances(User $user, Collection $people): array
    {
        $entries = DueEntry::query()
            ->where('user_id', $user->id)
            ->whereIn('person_id', $people->pluck('id'))
            ->get(['person_id', 'transaction_id']);

        $personOfLeg = $entries->pluck('person_id', 'transaction_id')->all();
        $out = array_fill_keys($people->pluck('id')->all(), 0);

        if ($personOfLeg === []) {
            return $out;
        }

        $legs = Transaction::query()
            ->where('user_id', $user->id)
            ->where(function ($q) use ($personOfLeg): void {
                $ids = array_keys($personOfLeg);
                $q->whereIn('id', $ids)->orWhereIn('reverses_id', $ids);
            })
            ->get(['id', 'reverses_id', 'direction', 'amount_minor']);

        foreach ($legs as $leg) {
            $person = $personOfLeg[$leg->reverses_id ?? $leg->id] ?? null;
            if ($person === null) {
                continue;
            }
            $out[$person] += $leg->direction === 'in' ? (int) $leg->amount_minor : -(int) $leg->amount_minor;
        }

        return $out;
    }

    /**
     * Ids of the Dues legs, among these, that have been reversed.
     *
     * @param  array<int, string>  $legIds
     * @return array<string, true>
     */
    public function reversed(User $user, array $legIds): array
    {
        return Transaction::query()
            ->where('user_id', $user->id)->whereIn('reverses_id', $legIds)
            ->pluck('reverses_id')->flip()->map(fn () => true)->all();
    }

    /**
     * The Dues screen: everyone, with balances and the totals.
     *
     * @return array<string, mixed>
     */
    public function overview(User $user, string $book): array
    {
        $people = DuePerson::query()->where('user_id', $user->id)->where('book', $book)->get();
        $balances = $this->balances($user, $people);

        $stats = DueEntry::query()
            ->where('user_id', $user->id)->whereIn('person_id', $people->pluck('id'))
            ->selectRaw('person_id, max(occurred_on) as last_on, count(*) as n')
            ->groupBy('person_id')->get()->keyBy('person_id');

        $today = Carbon::now()->toDateString();
        $rows = $people->map(fn (DuePerson $p): array => $this->shape($p, $balances[$p->id] ?? 0, $stats[$p->id] ?? null, $today))
            ->sort(function (array $a, array $b): int {
                // A reminder that has come due first, then the largest balance
                // either way, settled people last.
                return [$b['remind_due'], $b['balance_minor'] !== 0, abs($b['balance_minor'])]
                    <=> [$a['remind_due'], $a['balance_minor'] !== 0, abs($a['balance_minor'])];
            })->values()->all();

        $owed = array_sum(array_filter($balances, fn (int $v): bool => $v > 0));
        $owe = -array_sum(array_filter($balances, fn (int $v): bool => $v < 0));

        $account = Account::query()->where('user_id', $user->id)->where('book', $book)
            ->where('type', self::ACCOUNT_TYPE)->whereNull('archived_at')->value('id');

        return [
            'book' => $book,
            'currency' => self::CURRENCY,
            'account_id' => $account,
            'owed_to_you_minor' => $owed,
            'you_owe_minor' => $owe,
            'net_minor' => $owed - $owe,
            'people' => $rows,
        ];
    }

    /**
     * One person with every entry, newest first, and the balance after each.
     *
     * @return array<string, mixed>
     */
    public function person(User $user, DuePerson $person): array
    {
        $entries = $person->entries()->orderBy('occurred_on')->orderBy('id')->get();
        $reversed = $this->reversed($user, $entries->pluck('transaction_id')->all());
        $balance = $this->balances($user, collect([$person]))[$person->id] ?? 0;

        $running = 0;
        $rows = [];
        foreach ($entries as $e) {
            $isReversed = isset($reversed[$e->transaction_id]);
            $signed = DueEntry::KINDS[$e->kind] * $e->amount_minor;
            $running += $isReversed ? 0 : $signed;
            $rows[] = [
                'id' => $e->id,
                'kind' => $e->kind,
                'amount_minor' => $e->amount_minor,
                'signed_minor' => $signed,
                'currency' => $e->currency,
                'occurred_on' => $e->occurred_on,
                'note' => $e->note,
                'account_id' => $e->account_id,
                'transaction_id' => $e->transaction_id,
                'reversed' => $isReversed,
                'balance_after_minor' => $running,
            ];
        }

        $last = $entries->last();

        return [
            'person' => $this->shape($person, $balance, $last ? (object) ['last_on' => $last->occurred_on, 'n' => $entries->count()] : null, Carbon::now()->toDateString()),
            'entries' => array_reverse($rows),
        ];
    }

    /** @return array<string, mixed> */
    private function shape(DuePerson $p, int $balance, ?object $stats, string $today): array
    {
        return [
            'id' => $p->id,
            'name' => $p->name,
            'phone' => $p->phone,
            'note' => $p->note,
            'balance_minor' => $balance,
            'currency' => self::CURRENCY,
            'state' => $balance > 0 ? 'owes_you' : ($balance < 0 ? 'you_owe' : 'settled'),
            'last_on' => $stats ? substr((string) $stats->last_on, 0, 10) : null,
            'entries' => $stats ? (int) $stats->n : 0,
            'remind_on' => $p->remind_on,
            // A reminder only matters while something is owed.
            'remind_due' => $p->remind_on !== null && $p->remind_on <= $today && $balance !== 0,
        ];
    }

    /** The ledger line a person reads in their Ledger: "Lent to Rahim". */
    public static function describe(string $kind, string $name): string
    {
        return match ($kind) {
            'lent' => "Lent to {$name}",
            'got_back' => "{$name} paid back",
            'borrowed' => "Borrowed from {$name}",
            'paid_back' => "Paid back {$name}",
        };
    }
}
