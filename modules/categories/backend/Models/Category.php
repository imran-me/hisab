<?php

namespace Hisab\Categories\Models;

use App\Models\Concerns\HasHisabUlid;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Category extends Model
{
    use HasHisabUlid;

    /**
     * The three types. `transfer` is NOT one of them, and its absence is the
     * design: a transfer between your own accounts is not a category of
     * spending. See endpoints.md.
     */
    public const TYPES = ['income', 'expense', 'deposit'];

    public const BOOKS = ['personal', 'business'];

    protected $table = 'categories';

    protected $fillable = ['user_id', 'key', 'label', 'type', 'book', 'necessity', 'sort_order', 'archived_at'];

    protected function casts(): array
    {
        return [
            'archived_at' => 'datetime',
            'necessity' => 'integer',
            'sort_order' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->whereNull('archived_at');
    }

    public function isArchived(): bool
    {
        return $this->archived_at !== null;
    }
}
