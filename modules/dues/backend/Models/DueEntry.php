<?php

namespace Hisab\Dues\Models;

use App\Models\Concerns\HasHisabUlid;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;

/** One movement of money between you and a person, tied to its ledger leg. */
class DueEntry extends Model
{
    use HasHisabUlid;

    /** kind => sign on "what they owe you". */
    public const KINDS = ['lent' => 1, 'got_back' => -1, 'borrowed' => -1, 'paid_back' => 1];

    protected $table = 'dues_entries';

    protected $fillable = [
        'user_id', 'person_id', 'kind', 'amount_minor', 'currency', 'occurred_on',
        'note', 'account_id', 'transaction_id', 'is_demo',
    ];

    protected $hidden = ['user_id', 'is_demo'];

    protected function casts(): array
    {
        return ['amount_minor' => 'integer', 'is_demo' => 'boolean'];
    }

    protected function occurredOn(): Attribute
    {
        return Attribute::make(
            get: fn (?string $v): ?string => $v === null ? null : substr($v, 0, 10),
            set: fn (mixed $v): ?string => $v === null ? null : substr((string) $v, 0, 10),
        );
    }
}
