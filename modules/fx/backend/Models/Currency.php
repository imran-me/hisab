<?php

namespace Hisab\Fx\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A currency.
 *
 * Reference data: facts about the world, identical for everyone, never owned
 * and never created over the API. A currency that does not exist is a
 * migration, not a POST.
 */
class Currency extends Model
{
    protected $table = 'currencies';

    // The ISO 4217 code is the key. Both lines are required, and forgetting
    // either produces the same silent bug: Eloquent assumes an auto-incrementing
    // integer named `id`, so a save would try to write one and a lookup by code
    // would miss.
    protected $primaryKey = 'code';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = ['code', 'name', 'symbol', 'minor_unit', 'symbol_first', 'group', 'sort_order'];

    protected function casts(): array
    {
        return [
            // Cast, because this arrives from JSON as a string and is then used
            // as an exponent - 10 ** minor_unit. A string there is a silent
            // wrong answer rather than an error.
            'minor_unit' => 'integer',
            'symbol_first' => 'boolean',
            'sort_order' => 'integer',
        ];
    }
}
