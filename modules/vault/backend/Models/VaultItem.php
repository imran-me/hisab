<?php

namespace Hisab\Vault\Models;

use App\Models\Concerns\HasHisabUlid;
use Illuminate\Database\Eloquent\Model;

/**
 * One vault entry as the server holds it: an id, a blob, two timestamps.
 *
 * `blob` is the browser's ciphertext ({ v, iv, ct }), encrypted again by the
 * cast with Laravel's Crypt and the app key - the outer layer.
 */
class VaultItem extends Model
{
    use HasHisabUlid;

    protected $table = 'vault_items';

    protected $fillable = ['id', 'user_id', 'blob'];

    protected $hidden = ['user_id'];

    protected function casts(): array
    {
        return ['blob' => 'encrypted:array'];
    }
}
