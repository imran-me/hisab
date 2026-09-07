<?php

namespace App\Support;

use Illuminate\Support\Str;

/**
 * The PHP twin of slugify() in shared/js/core/id.js.
 *
 * These two have to agree, because a category created offline is slugged in the
 * browser and one created against the API is slugged here, and the same label
 * must produce the same key either way.
 *
 * THE BEHAVIOUR THAT LOOKS LIKE A BUG AND IS NOT: Bengali and Arabic letters
 * are DROPPED rather than transliterated, so a label written entirely in Bangla
 * slugs to an empty string. The frontend does the same and says so. That is why
 * every caller must have a fallback — in this product, the row's own id — and
 * why this returns '' rather than inventing something.
 *
 * Transliterating instead was considered and rejected: it produces keys nobody
 * recognises, and the key is not the label. It is a stable handle for exports
 * and URLs, and the id already serves when the label has nothing latin in it.
 */
class Slug
{
    public static function make(?string $text): string
    {
        $value = (string) $text;

        // Decompose accents so the combining marks can be stripped: 'é' becomes
        // 'e' + U+0301, and the second half is removed below.
        if (class_exists(\Normalizer::class)) {
            $value = (string) \Normalizer::normalize($value, \Normalizer::FORM_KD);
        }

        // The combining-marks block, written as an escape rather than as literal
        // characters - a literal combining mark in source is invisible in most
        // editors and does not survive every copy-paste.
        $value = (string) preg_replace('/[\x{0300}-\x{036f}]/u', '', $value);

        $value = Str::lower($value);
        $value = (string) preg_replace('/[^a-z0-9]+/', '-', $value);
        $value = trim($value, '-');

        return Str::limit($value, 60, '');
    }
}
