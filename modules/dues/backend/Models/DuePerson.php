<?php

namespace Hisab\Dues\Models;

use App\Models\Concerns\HasHisabUlid;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Someone you lend to or borrow from. No balance column: see endpoints.md. */
class DuePerson extends Model
{
    use HasHisabUlid;

    protected $table = 'dues_people';

    protected $fillable = ['user_id', 'book', 'name', 'phone', 'note', 'remind_on', 'is_demo'];

    protected $hidden = ['user_id', 'is_demo'];

    protected function casts(): array
    {
        return ['is_demo' => 'boolean'];
    }

    /** A calendar date kept as 'Y-m-d' - the same trap as Transaction::occurredOn. */
    protected function remindOn(): Attribute
    {
        return Attribute::make(
            get: fn (?string $v): ?string => $v === null ? null : substr($v, 0, 10),
            set: fn (mixed $v): ?string => ($v === null || $v === '') ? null : substr((string) $v, 0, 10),
        );
    }

    public function entries(): HasMany
    {
        return $this->hasMany(DueEntry::class, 'person_id');
    }
}
