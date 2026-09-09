<?php

namespace Hisab\Accounts\Services;

use App\Models\User;
use Hisab\Accounts\Models\Account;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Every rule about accounts.
 */
class AccountBook
{
    /**
     * @param  array<string, mixed>  $data
     */
    public function create(User $user, array $data): Account
    {
        $account = new Account($data);
        $account->user_id = $user->id;

        // Set explicitly, because the 'personal' default lives in the DATABASE
        // and is only applied on insert. Until then $account->book is null - and
        // both the default-clearing and the sort_order query below scope on it,
        // so leaving it null makes `where('book', null)` match nothing. The
        // symptom is not an error: it is two accounts both marked default, found
        // much later by whoever wonders why the entry sheet opens on the wrong
        // one.
        $account->book = $data['book'] ?? 'personal';

        // A credit limit only means anything on a card. Nulled rather than
        // rejected, for the same reason a necessity band is ignored on an
        // income: the client sends one form for every type, and refusing the
        // request over a field the chosen type has no use for is an error the
        // person cannot see the cause of.
        if ($account->type !== 'card') {
            $account->credit_limit_minor = null;
        }

        $account->sort_order = $data['sort_order']
            ?? ((int) $this->owned($user)->where('book', $account->book)->max('sort_order') + 1);

        $account = $this->withDefaulting($user, $account, (bool) ($data['is_default'] ?? false));

        $account->save();

        return $account;
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function update(Account $account, array $data): Account
    {
        // `book` and `currency` are absent from the update request rather than
        // ignored here, so this cannot silently drop them - see
        // UpdateAccountRequest for why neither can change.
        $account->fill($data);

        if ($account->type !== 'card') {
            $account->credit_limit_minor = null;
        }

        if (array_key_exists('is_default', $data)) {
            $account = $this->withDefaulting($account->user, $account, (bool) $data['is_default']);
        }

        if (array_key_exists('archived', $data)) {
            $account->archived_at = $data['archived'] ? Carbon::now() : null;

            // An archived account must not stay the default, or the entry sheet
            // opens on an account that is no longer in its own picker.
            if ($data['archived']) {
                $account->is_default = false;
            }
        }

        $account->save();

        return $account;
    }

    /**
     * Reorder, from a list of ids in the order they should appear.
     *
     * Positions come from the POSITION IN THE ARRAY rather than from numbers
     * the client sends. A client that supplies its own sort_order values can
     * send two accounts the same one, and the list then reorders itself
     * differently on each render depending on how the database breaks the tie.
     *
     * Ids that are not this owner's are ignored rather than rejected: the list
     * is a statement of order, and one stale id in it should not refuse to
     * reorder the rest.
     *
     * @param  list<string>  $ids
     */
    public function reorder(User $user, array $ids): void
    {
        DB::transaction(function () use ($user, $ids): void {
            foreach (array_values($ids) as $position => $id) {
                $this->owned($user)->whereKey($id)->update(['sort_order' => $position]);
            }
        });
    }

    /**
     * Hard delete, and only when nothing has ever referenced it.
     *
     * The contract is explicit that this refuses with 409 rather than archiving
     * on the caller's behalf: archiving is a different decision with a different
     * consequence, and the client offers it. Silently doing the safe thing here
     * would leave someone believing an account was gone when it was not.
     *
     * @throws ValidationException
     */
    public function delete(Account $account): void
    {
        $count = $this->transactionCount($account);

        if ($count > 0) {
            // Carries the number, because "you cannot delete this" and "this has
            // 412 transactions in it" prompt very different next actions.
            throw ValidationException::withMessages([
                'account' => __('This account has :count transactions. Archive it instead.', ['count' => $count]),
            ])->status(409);
        }

        $account->delete();
    }

    /**
     * Only one default per book.
     *
     * Enforced by clearing the others rather than by a unique index: the rule is
     * "at most one row where is_default is true FOR THIS user and book", which a
     * plain unique index cannot express, and a partial index is not portable
     * between MySQL and SQLite.
     */
    private function withDefaulting(User $user, Account $account, bool $makeDefault): Account
    {
        if (! $makeDefault) {
            return $account;
        }

        $this->owned($user)
            ->where('book', $account->book)
            ->when($account->exists, fn ($q) => $q->whereKeyNot($account->id))
            ->update(['is_default' => false]);

        $account->is_default = true;

        return $account;
    }

    /**
     * How many transactions point at this account.
     *
     * Asks the schema rather than importing a ledger model: the ledger owns that
     * table, and a hard reference to another module from here would break the
     * module test in both directions. Counts BOTH legs, so a transfer that
     * touches this account blocks deletion from either side.
     */
    public function transactionCount(Account $account): int
    {
        $connection = $account->getConnection();

        if (! $connection->getSchemaBuilder()->hasTable('transactions')) {
            return 0;
        }

        return $connection->table('transactions')
            ->where('account_id', $account->id)
            ->orWhere('counter_account_id', $account->id)
            ->count();
    }

    private function owned(User $user)
    {
        return Account::query()->where('user_id', $user->id);
    }
}
