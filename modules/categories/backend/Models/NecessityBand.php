<?php

namespace Hisab\Categories\Models;

use Illuminate\Database\Eloquent\Model;

/** How necessary a kind of spending is. Reference data; 1 is the most necessary. */
class NecessityBand extends Model
{
    protected $table = 'necessity_bands';
    protected $primaryKey = 'band';
    protected $keyType = 'int';
    public $incrementing = false;

    protected $fillable = ['band', 'key', 'label', 'hint'];
}
