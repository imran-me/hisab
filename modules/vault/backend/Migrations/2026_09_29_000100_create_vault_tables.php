<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The vault on the server: opaque blobs and one header per owner.
 *
 * Read ../../SECURITY.md first. Nothing here can be read by the server: each
 * blob is AES-GCM ciphertext made in the browser under a key the server has
 * never seen, and it is encrypted AGAIN at rest with the app key (the
 * `encrypted:array` cast on the models) - the two layers of SECURITY.md §2.
 *
 * Deliberately no title, kind or tag column: endpoints.md, "What is
 * deliberately NOT a column".
 */
return new class extends Migration
{
    public function up(): void
    {
        // Everything needed to ATTEMPT an unlock and nothing that helps one
        // succeed: KDF parameters, the salt, the wrapped key and a verifier.
        // None of it is secret; it is still stored under the outer layer.
        Schema::create('vault_headers', function (Blueprint $table): void {
            $table->foreignUlid('user_id')->primary()->constrained()->cascadeOnDelete();
            $table->text('header');
            $table->timestamps();
        });

        Schema::create('vault_items', function (Blueprint $table): void {
            // Minted in the browser, so an entry made offline keeps its id when
            // it reaches the server.
            $table->ulid('id')->primary();
            $table->foreignUlid('user_id')->constrained()->cascadeOnDelete();
            $table->text('blob');
            $table->timestamps();

            $table->index('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vault_items');
        Schema::dropIfExists('vault_headers');
    }
};
