<?php

namespace Hisab\Fx\Models;

use App\Models\Concerns\HasHisabUlid;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One exchange rate, on one date.
 *
 * `rate` is the number of QUOTE units per one BASE unit - the direction people
 * quote it ("the dollar is at 122.50").
 */
class FxRate extends Model
{
    use HasHisabUlid;

    protected $table = 'fx_rates';

    protected $fillable = ['user_id', 'base', 'quote', 'rate', 'as_of', 'source'];

    /**
     * as_of is a DATE - a calendar day - and is kept as a 'Y-m-d' STRING rather
     * than cast to a Carbon.
     *
     * Laravel's `date` cast looks like the obvious choice and is a trap here. It
     * serialises through the model's date format, 'Y-m-d H:i:s', so a write puts
     * '2026-09-05 00:00:00' into the column. MySQL truncates that to a DATE and
     * everything appears to work; SQLite keeps the string verbatim, so a later
     * `where('as_of', '2026-09-05')` matches nothing, updateOrCreate decides the
     * row is absent, and the insert collides with the unique index.
     *
     * That is a bug the production database HIDES and the test database
     * exposes - which is the whole argument for running the suite on both.
     *
     * A plain string is also what api-contract.md actually specifies: a local
     * calendar date, explicitly not a timestamp. There is no instant here to
     * convert and no timezone that could shift it.
     */
    protected function asOf(): Attribute
    {
        return Attribute::make(
            get: fn (?string $value): ?string => $value === null ? null : substr($value, 0, 10),
            set: fn (mixed $value): ?string => match (true) {
                $value === null => null,
                $value instanceof \DateTimeInterface => $value->format('Y-m-d'),
                default => substr((string) $value, 0, 10),
            },
        );
    }

    protected function casts(): array
    {
        return [
            // DELIBERATELY NOT cast to float or decimal. Eloquent's `decimal:10`
            // cast round-trips through PHP's float, which cannot hold 122.5
            // exactly - the same reason money is stored as an integer. The
            // driver hands this back as a string with every digit intact, and
            // it stays a string all the way to the client, which parses it.
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * The rows that apply to this owner: their own, plus the seeded estimates.
     *
     * Both, not either - a fresh install has only seeds, and an owner who has
     * entered one rate still needs the seeds for every other pair.
     */
    public function scopeVisibleTo(Builder $query, ?string $userId): Builder
    {
        return $query->where(function (Builder $q) use ($userId): void {
            $q->whereNull('user_id')->orWhere('user_id', $userId);
        });
    }
}
