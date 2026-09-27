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

    /** What a bank account is, as the bank calls it. FDR and DPS are held, not spendable. */
    public const BANK_ACCOUNT_TYPES = ['savings', 'current', 'salary', 'fdr', 'dps'];

    public const CARD_NETWORKS = ['visa', 'mastercard', 'amex', 'unionpay', 'other'];

    /**
     * The colours an account can wear, by token name. A name, never a hex:
     * the palette lives in _variables.css and changes with the theme.
     */
    public const COLOURS = [
        'marigold', 'green', 'violet', 'blue', 'rose', 'teal', 'orange', 'slate',
    ];

    protected $table = 'accounts';

    protected $fillable = [
        'id', 'user_id', 'name', 'type', 'currency', 'book',
        'opening_balance_minor', 'opening_on', 'institution', 'number_tail',
        'credit_limit_minor', 'is_default', 'is_demo', 'sort_order', 'archived_at',
        'branch', 'holder_name', 'account_number', 'bank_account_type', 'routing_number',
        'card_network', 'statement_day', 'colour', 'notes',
        'statement_balance_minor', 'statement_on',
    ];

    /**
     * Never serialised by accident. The full number leaves the server only
     * through AccountController::show(), which adds it on purpose.
     */
    protected $hidden = ['account_number'];

    protected function casts(): array
    {
        return [
            // The app key encrypts it at rest: a stolen database holds
            // ciphertext here, not a list of account numbers.
            'account_number' => 'encrypted',
            'statement_day' => 'integer',
            'statement_balance_minor' => 'integer',
            // Integers in the currency's minor unit. Never floats, and never
            // divided by a constant 100 - the number of decimal places comes
            // from the currency row, because it is 3 for KWD and 0 for JPY.
            'opening_balance_minor' => 'integer',
            'credit_limit_minor' => 'integer',
            'is_default' => 'boolean',
            'is_demo' => 'boolean',
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

    /** The statement date, as a plain 'Y-m-d' for the same reason as opening_on. */
    protected function statementOn(): Attribute
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
