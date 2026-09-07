<?php

namespace Hisab\Accounts\Models;

use App\Models\Concerns\HasHisabUlid;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Account extends Model
{
    use HasHisabUlid;

    public const TYPES = ['cash', 'bank', 'mfs', 'card', 'wallet', 'savings', 'investment'];

    /**
     * Types whose money is yours but is NOT money you can spend today.
     *
     * This constant is the whole reason `type` is not decoration. A DPS balance
     * folded into the spendable total is a number people budget against and
     * then find is not there — CONVENTIONS.md makes the same point about
     * `deposit` not being an expense, and this is the account-shaped half of it.
     */
    public const HELD_TYPES = ['savings', 'investment'];

    protected $table = 'accounts';

    protected $fillable = [
        'id', 'user_id', 'name', 'type', 'currency', 'book',
        'opening_balance_minor', 'opening_on', 'institution', 'number_tail',
        'credit_limit_minor', 'is_default', 'sort_order', 'archived_at',
    ];

    protected function casts(): array
    {
        return [
            // Integers in the currency's minor unit. Never floats, and never
            // divided by a constant 100 - the number of decimal places comes
            // from the currency row, because it is 3 for KWD and 0 for JPY.
            'opening_balance_minor' => 'integer',
            'credit_limit_minor' => 'integer',
            'is_default' => 'boolean',
            'sort_order' => 'integer',
            'archived_at' => 'datetime',
        ];
    }

    /**
     * A calendar date, kept as a 'Y-m-d' string rather than cast to a Carbon.
     *
     * Same reason as FxRate::asOf — Laravel's `date` cast serialises through
     * 'Y-m-d H:i:s', which MySQL truncates into a DATE column and SQLite keeps
     * verbatim, so a lookup that works in production silently misses in the
     * tests. api-contract.md specifies a local date here, not an instant.
     */
    protected function openingOn(): Attribute
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

    public function scopeActive(Builder $query): Builder
    {
        return $query->whereNull('archived_at');
    }

    /** Money that is yours but not spendable today. */
    public function isHeld(): bool
    {
        return in_array($this->type, self::HELD_TYPES, true);
    }

    public function isArchived(): bool
    {
        return $this->archived_at !== null;
    }
}
