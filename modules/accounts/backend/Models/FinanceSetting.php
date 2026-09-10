<?php

namespace Hisab\Accounts\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * The handful of finance figures that are inputs rather than sums.
 */
class FinanceSetting extends Model
{
    protected $table = 'finance_settings';

    // The owner is the key, and it is not auto-incrementing.
    protected $primaryKey = 'user_id';
    protected $keyType = 'string';
    public $incrementing = false;

    /**
     * Defaults in PHP as well as in the schema.
     *
     * firstOrCreate() returns the model built from the attributes IT set, not
     * a row read back from the database - so a column filled by a database
     * default comes back null on the instance that created it. carry_forward
     * read as null, cast to false, and carry-over was silently off for exactly
     * one request: the first one after a person's settings row was created.
     * Nothing errored, and the opening balance was simply zero.
     */
    protected $attributes = [
        'opening_balance_minor' => 0,
        'carry_forward' => true,
        'monthly_budget_minor' => 0,
        'savings_goal_minor' => 0,
    ];

    protected $fillable = [
        'user_id', 'opening_balance_minor', 'carry_forward',
        'monthly_budget_minor', 'savings_goal_minor',
    ];

    protected function casts(): array
    {
        return [
            'opening_balance_minor' => 'integer',
            'monthly_budget_minor' => 'integer',
            'savings_goal_minor' => 'integer',
            'carry_forward' => 'boolean',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * The owner's settings, creating the defaults on first ask.
     *
     * firstOrCreate rather than a seeder: these belong to a person, and a row
     * of zeros is exactly what someone who has never opened the settings has.
     */
    public static function forOwner(User $user): self
    {
        return static::query()->firstOrCreate(['user_id' => $user->id]);
    }
}
