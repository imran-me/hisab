<?php

namespace Hisab\Budgets\Models;

use App\Models\Concerns\HasHisabUlid;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One category's monthly limit. The limit only: spent is the ledger's.
 */
class Budget extends Model
{
    use HasHisabUlid;

    protected $table = 'budgets';

    protected $fillable = ['user_id', 'category_id', 'book', 'amount_minor', 'currency', 'is_demo'];

    protected $hidden = ['user_id', 'is_demo'];

    protected function casts(): array
    {
        return [
            'amount_minor' => 'integer',
            'is_demo' => 'boolean',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
