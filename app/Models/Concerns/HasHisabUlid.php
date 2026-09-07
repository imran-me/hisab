<?php

namespace App\Models\Concerns;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Support\Str;

/**
 * A ULID primary key in the casing this product actually uses.
 *
 * Laravel's HasUlids returns a LOWERCASE ULID. The frontend returns an
 * UPPERCASE one — shared/js/core/id.js encodes against Crockford's alphabet as
 * '0123456789ABCDEFGHJKMNPQRSTVWXYZ' — and, more to the point, its isUlid()
 * validates /^[0-9A-HJKMNP-TV-Z]{26}$/, which rejects a lowercase id outright.
 * The example in shared/backend/api-contract.md is uppercase as well.
 *
 * So the two halves disagreed. It would not have failed at the seam where it
 * was introduced: ids are opaque strings, MySQL compares them case-insensitively
 * under the default collation, and every server-generated id would have round
 * -tripped through the database perfectly happily. It would have surfaced later
 * and somewhere else — the first time the frontend validated an id the server
 * had minted, or the first time an id was compared to one the browser created
 * offline, in JavaScript, where 'a' !== 'A'.
 *
 * Crockford base32 is formally case-insensitive, so either casing is a valid
 * ULID and neither side was wrong. That is exactly why this had to be decided
 * rather than left to whichever half happened to create a record first.
 * Uppercase wins because it is what the contract already documents and what the
 * frontend already enforces.
 */
trait HasHisabUlid
{
    use HasUlids;

    public function newUniqueId(): string
    {
        return strtoupper((string) Str::ulid());
    }
}
