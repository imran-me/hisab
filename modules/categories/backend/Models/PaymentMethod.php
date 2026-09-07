<?php

namespace Hisab\Categories\Models;

use Illuminate\Database\Eloquent\Model;

/** Cash, bKash, card. Reference data, keyed by its own slug. */
class PaymentMethod extends Model
{
    protected $table = 'payment_methods';
    protected $primaryKey = 'key';
    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = ['key', 'label', 'icon', 'sort_order'];

    protected function casts(): array
    {
        return ['sort_order' => 'integer'];
    }
}
