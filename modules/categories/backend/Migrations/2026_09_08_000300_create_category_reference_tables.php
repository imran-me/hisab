<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Reference data for categories: the necessity bands and the payment methods.
 *
 * Tables rather than PHP constants because CONVENTIONS.md puts rules in data -
 * and because both are shown to the person with a label and a hint they will
 * eventually want to reword, which should not be a deployment.
 *
 * Neither is owned. They are the vocabulary, not anyone's money.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('necessity_bands', function (Blueprint $table): void {
            // The band number IS the key, and it is ordered: 1 is the most
            // necessary. Reports sort and compare on it, so an arbitrary id
            // with a separate sort column would be two things to keep in step.
            $table->unsignedTinyInteger('band')->primary();
            $table->string('key', 32)->unique();
            $table->string('label');
            $table->string('hint')->nullable();
            $table->timestamps();
        });

        Schema::create('payment_methods', function (Blueprint $table): void {
            $table->string('key', 32)->primary();
            $table->string('label');
            $table->string('icon', 32)->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payment_methods');
        Schema::dropIfExists('necessity_bands');
    }
};
