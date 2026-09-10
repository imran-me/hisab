<?php

namespace Hisab\Ledger\Models;

use App\Models\Concerns\HasHisabUlid;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One leg: one effect on one account.
 */
class Transaction extends Model
{
    use HasHisabUlid;

    public const TYPES = ['income', 'expense', 'deposit', 'transfer'];

    /**
     * Types that write a second leg when a destination account is named.
     *
     * A transfer ALWAYS pairs. A deposit pairs only when the destination is an
     * account you track — moving cash into a DPS you have set up here — and
     * stays single when it is not, because money leaving for a DPS held
     * elsewhere has no second account to land in.
     */
    public const PAIRABLE = ['transfer', 'deposit'];

    protected $table = 'transactions';

    protected $fillable = [
        'id', 'user_id', 'group_id', 'reverses_id', 'reversal_reason', 'corrects_id',
        'type', 'direction', 'account_id',
        'counter_account_id', 'amount_minor', 'currency', 'category_id',
        'category_label', 'necessity', 'method', 'payee', 'note',
        'occurred_on', 'book', 'fx_rate', 'fx_as_of',
    ];

    protected function casts(): array
    {
        return [
            'amount_minor' => 'integer',
            'necessity' => 'integer',
            // fx_rate is NOT cast - it stays the string the driver returns, so
            // no digits are lost through a float. Same reasoning as FxRate.
        ];
    }

    /**
     * A local calendar date, kept as 'Y-m-d'.
     *
     * Laravel's `date` cast serialises through 'Y-m-d H:i:s', which MySQL
     * truncates into a DATE column and SQLite stores verbatim — so a range
     * filter that works in production silently misses rows in the test suite.
     * That bug was found once already, in FxRate; it is the same one.
     */
    protected function occurredOn(): Attribute
    {
        return self::dateOnly();
    }

    protected function fxAsOf(): Attribute
    {
        return self::dateOnly();
    }

    private static function dateOnly(): Attribute
    {
        return Attribute::make(
            get: fn (?string $value): ?string => $value === null ? null : substr($value, 0, 10),
            set: fn (mixed $value): ?string => match (true) {
                $value === null, $value === '' => null,
                $value instanceof \DateTimeInterface => $value->format('Y-m-d'),
                default => substr((string) $value, 0, 10),
            },
        );
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** Both legs of a pair, this one included. */
    public function scopeInGroup(Builder $query, ?string $groupId): Builder
    {
        return $query->where('group_id', $groupId);
    }

    public function isPaired(): bool
    {
        return $this->group_id !== null;
    }

    /** This entry cancels another one. */
    public function isReversal(): bool
    {
        return $this->reverses_id !== null;
    }

    /**
     * Entries that are still standing: not a reversal, and not reversed.
     *
     * Used by the ledger list. The rows are NOT excluded from any total - they
     * net to zero on their own - so this is presentation, and the figures are
     * the same with or without it.
     */
    public function scopeStanding(Builder $query): Builder
    {
        return $query
            ->whereNull('reverses_id')
            ->whereNotExists(function ($sub): void {
                $sub->selectRaw('1')
                    ->from('transactions as r')
                    ->whereColumn('r.reverses_id', 'transactions.id');
            });
    }
}
