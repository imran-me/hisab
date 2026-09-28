<?php

namespace Hisab\Budgets\Models;

use App\Models\Concerns\HasHisabUlid;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;

/** A target. How far along it is comes from the ledger (GoalBook). */
class Goal extends Model
{
    use HasHisabUlid;

    protected $table = 'goals';

    protected $fillable = [
        'user_id', 'name', 'target_minor', 'currency', 'target_on', 'account_id',
        'category_id', 'icon', 'started_on', 'achieved_at', 'is_demo',
    ];

    protected $hidden = ['user_id', 'is_demo'];

    protected function casts(): array
    {
        return ['target_minor' => 'integer', 'is_demo' => 'boolean', 'achieved_at' => 'datetime'];
    }

    protected function targetOn(): Attribute
    {
        return self::dateOnly();
    }

    protected function startedOn(): Attribute
    {
        return self::dateOnly();
    }

    /** 'Y-m-d', never through the date cast - the SQLite/MySQL trap in Transaction. */
    private static function dateOnly(): Attribute
    {
        return Attribute::make(
            get: fn (?string $v): ?string => $v === null ? null : substr($v, 0, 10),
            set: fn (mixed $v): ?string => ($v === null || $v === '') ? null : substr((string) $v, 0, 10),
        );
    }
}
