<?php

namespace Hisab\Accounts\Models;

use App\Models\Concerns\HasHisabUlid;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A month that has been reviewed, with the figures as they stood then. */
class MonthClose extends Model
{
    use HasHisabUlid;

    protected $table = 'month_closes';

    protected $fillable = ['user_id', 'month', 'note', 'snapshot', 'closed_at'];

    protected function casts(): array
    {
        return [
            'snapshot' => 'array',
            'closed_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
