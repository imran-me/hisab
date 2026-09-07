<?php

namespace Hisab\Categories\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Renaming, and nothing else.
 *
 * `type` and `book` are absent rather than validated-and-ignored, following
 * CONVENTIONS.md on derived figures for the same reason: a field that cannot be
 * set should not be accepted. Changing either would rewrite history - a
 * category moving from expense to income flips the sign of every transaction
 * already filed under it.
 */
class UpdateCategoryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'label' => ['required', 'string', 'max:120'],
        ];
    }
}
