<?php

namespace Hisab\Vault\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * The owner's vault header: KDF parameters, salt, wrapped key, verifier.
 * Public by design (SECURITY.md §3), stored under the outer layer anyway.
 */
class VaultHeader extends Model
{
    protected $table = 'vault_headers';

    protected $primaryKey = 'user_id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['user_id', 'header'];

    protected function casts(): array
    {
        return ['header' => 'encrypted:array'];
    }
}
