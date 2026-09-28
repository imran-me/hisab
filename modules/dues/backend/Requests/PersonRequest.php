<?php

namespace Hisab\Dues\Requests;

use Illuminate\Foundation\Http\FormRequest;

/** A person's details. Creating requires a name; editing makes every field optional. */
class PersonRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $creating = $this->isMethod('post');

        return [
            'name' => [$creating ? 'required' : 'sometimes', 'string', 'min:1', 'max:80'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:32'],
            'note' => ['sometimes', 'nullable', 'string', 'max:500'],
            'book' => ['sometimes', 'string', 'in:personal,business'],
            'remind_on' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
        ];
    }
}
