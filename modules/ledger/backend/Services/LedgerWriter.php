<?php

namespace Hisab\Ledger\Services;

use App\Models\User;
use Hisab\Ledger\Models\Transaction;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Writing transactions, including the pairs.
 *
 * The rule this class exists to guarantee: A PAIR IS WRITTEN WHOLE OR NOT AT
 * ALL. A half-applied transfer is money that has left one account and arrived
 * nowhere, and no balance recovers from that without someone repairing it by
 * hand. Every method here that touches more than one row does so inside a
 * database transaction.
 */
class LedgerWriter
{
    /**
     * @param  array<string, mixed>  $data
     * @return Collection<int, Transaction>  The legs written, source leg first.
     */
    public function create(User $user, array $data): Collection
    {
        return DB::transaction(function () use ($user, $data): Collection {
            $type = $data['type'];
            $destination = $data['to_account_id'] ?? null;

            // A transfer without a destination is not a transfer. Checked here
            // rather than only in the request class because this is the rule,
            // and the request is one caller of it.
            if ($type === 'transfer' && $destination === null) {
                throw ValidationException::withMessages([
                    'to_account_id' => __('A transfer needs an account to move the money into.'),
                ]);
            }

            $pairs = $destination !== null && in_array($type, Transaction::PAIRABLE, true);
            $groupId = $pairs ? strtoupper((string) Str::ulid()) : null;

            $source = $this->leg($user, $data, [
                'group_id' => $groupId,
                // income adds to its account; everything else takes from it.
                // A deposit's source leg is `out` - the money is leaving the
                // spendable account - and that is the leg the deposit total is
                // summed over, exactly once.
                'direction' => $type === 'income' ? 'in' : 'out',
                'account_id' => $data['account_id'],
                'counter_account_id' => $destination,
            ]);

            $legs = new Collection([$source]);

            if ($pairs) {
                $legs->push($this->leg($user, $data, [
                    'group_id' => $groupId,
                    'direction' => 'in',
                    'account_id' => $destination,
                    'counter_account_id' => $data['account_id'],
                    // A transfer is not spending, so neither leg carries a
                    // category. Nulled here rather than trusted from the client.
                    'category_id' => null,
                    'category_label' => null,
                    'necessity' => null,
                ]));
            }

            return $legs;
        });
    }

    /**
     * Edit.
     *
     * REWRITES the pair rather than patching one leg. Editing a transfer can
     * change the amount, either account or the direction of the whole thing, and
     * patching legs individually means working out which of the two you were
     * handed and what that implies for the other. Deleting both and writing them
     * again from the merged data is one code path instead of six, and it cannot
     * leave the pair inconsistent.
     *
     * @param  array<string, mixed>  $data
     * @return Collection<int, Transaction>
     */
    public function update(User $user, Transaction $transaction, array $data): Collection
    {
        return DB::transaction(function () use ($user, $transaction, $data): Collection {
            $existing = $this->groupOf($transaction);

            // The source leg is the authoritative one: it carries the category,
            // the payee and the direction that decides the type's meaning.
            $source = $existing->firstWhere('direction', $transaction->type === 'income' ? 'in' : 'out')
                ?? $existing->first();

            $merged = array_merge($this->toInput($source), $data);

            $this->deleteGroup($transaction);

            return $this->create($user, $merged);
        });
    }

    public function delete(Transaction $transaction): void
    {
        DB::transaction(function () use ($transaction): void {
            $this->deleteGroup($transaction);
        });
    }

    /**
     * Both legs, given either one of them.
     *
     * @return Collection<int, Transaction>
     */
    public function groupOf(Transaction $transaction): Collection
    {
        if (! $transaction->isPaired()) {
            return new Collection([$transaction]);
        }

        return Transaction::query()
            ->where('user_id', $transaction->user_id)
            ->inGroup($transaction->group_id)
            ->get();
    }

    private function deleteGroup(Transaction $transaction): void
    {
        if (! $transaction->isPaired()) {
            $transaction->delete();

            return;
        }

        // Deleting one leg of a transfer would leave money that arrived from
        // nowhere. Both go, or neither.
        Transaction::query()
            ->where('user_id', $transaction->user_id)
            ->inGroup($transaction->group_id)
            ->delete();
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  array<string, mixed>  $overrides
     */
    private function leg(User $user, array $data, array $overrides): Transaction
    {
        $type = $data['type'];

        $attributes = array_merge([
            'user_id' => $user->id,
            'type' => $type,
            // Always positive. The sign lives in `direction`; a signed amount
            // and a direction are two representations of one fact, and two
            // representations disagree eventually.
            'amount_minor' => abs((int) $data['amount_minor']),
            'currency' => $data['currency'],
            'category_id' => $type === 'transfer' ? null : ($data['category_id'] ?? null),
            'category_label' => null,
            // 1..4 on expenses only. There is no sense in which receiving a
            // salary was avoidable.
            'necessity' => $type === 'expense' ? ($data['necessity'] ?? null) : null,
            'method' => $data['method'] ?? null,
            'payee' => $data['payee'] ?? null,
            'note' => $data['note'] ?? null,
            'occurred_on' => $data['occurred_on'],
            'book' => $data['book'] ?? 'personal',
            'fx_rate' => null,
            'fx_as_of' => null,
        ], $overrides);

        $transaction = new Transaction($attributes);

        // Only when the client supplied one: the id is validated against the
        // uniqueness rule in the request, and only the source leg can carry it.
        if (($overrides['direction'] ?? null) !== 'in' && ! empty($data['id'])) {
            $transaction->id = strtoupper((string) $data['id']);
        }

        $this->snapshotCategory($transaction);
        $this->snapshotRate($transaction, $data['fx_rate_id'] ?? null);

        $transaction->save();

        return $transaction;
    }

    /**
     * Copy the category's name onto the row.
     *
     * CONVENTIONS.md, snapshot vs read-through: renaming a category must not
     * rewrite last year's report. It also keeps the row readable after the
     * category is archived or deleted.
     *
     * Read through the query builder rather than the categories model, so this
     * module does not depend on that one.
     */
    private function snapshotCategory(Transaction $transaction): void
    {
        if ($transaction->category_id === null) {
            return;
        }

        $category = DB::table('categories')
            ->where('id', $transaction->category_id)
            ->where('user_id', $transaction->user_id)
            ->first(['label', 'necessity', 'type']);

        if ($category === null) {
            // Not this owner's category, or gone. Dropped rather than stored:
            // a category_id pointing at someone else's row is worse than none.
            $transaction->category_id = null;

            return;
        }

        $transaction->category_label = $category->label;

        // The band comes from the category unless the client overrode it, so a
        // row filed under "Rent" is essential without anyone re-stating it.
        if ($transaction->type === 'expense' && $transaction->necessity === null) {
            $transaction->necessity = $category->necessity;
        }
    }

    /**
     * Snapshot the FX rate when the amount is not in the account's currency.
     *
     * api-contract.md §7: the client sends the RATE ID, never a rate. A client
     * that can post its own rate can post any figure it likes into a converted
     * total, which is the same class of problem as posting a balance.
     */
    private function snapshotRate(Transaction $transaction, ?string $rateId): void
    {
        $accountCurrency = DB::table('accounts')
            ->where('id', $transaction->account_id)
            ->value('currency');

        if ($accountCurrency === null || $accountCurrency === $transaction->currency) {
            return;
        }

        if ($rateId === null) {
            return;
        }

        $rate = DB::table('fx_rates')
            ->where('id', strtoupper($rateId))
            // The owner's own rate, or a shared seeded one. Anything else is
            // not theirs to snapshot.
            ->where(fn ($q) => $q->whereNull('user_id')->orWhere('user_id', $transaction->user_id))
            ->first(['rate', 'as_of']);

        if ($rate === null) {
            return;
        }

        $transaction->fx_rate = $rate->rate;
        $transaction->fx_as_of = $rate->as_of;
    }

    /**
     * A leg, back in the shape create() takes.
     *
     * @return array<string, mixed>
     */
    private function toInput(Transaction $leg): array
    {
        return [
            'type' => $leg->type,
            'account_id' => $leg->account_id,
            'to_account_id' => $leg->counter_account_id,
            'amount_minor' => $leg->amount_minor,
            'currency' => $leg->currency,
            'category_id' => $leg->category_id,
            'necessity' => $leg->necessity,
            'method' => $leg->method,
            'payee' => $leg->payee,
            'note' => $leg->note,
            'occurred_on' => $leg->occurred_on,
            'book' => $leg->book,
        ];
    }
}
