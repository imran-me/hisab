<?php

namespace Hisab\Categories\Requests;

use Hisab\Categories\Models\Category;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreCategoryRequest extends FormRequest
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

            // Rule::in over the model's own constant, so adding a type is one
            // edit rather than three that can disagree. `transfer` is absent on
            // purpose - see endpoints.md.
            'type' => ['required', Rule::in(Category::TYPES)],
            'book' => ['sometimes', Rule::in(Category::BOOKS)],

            // `nullable` and not `required_if`: sent on an income or a deposit
            // it is IGNORED rather than rejected, because the client submits one
            // form for every type and a 422 over a field that has no meaning for
            // the chosen type is an error the person cannot see the cause of.
            // CategoryBook decides what it ends up as.
            'necessity' => ['nullable', 'integer', Rule::exists('necessity_bands', 'band')],
        ];
    }
}
