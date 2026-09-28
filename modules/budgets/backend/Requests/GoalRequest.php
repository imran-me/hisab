<?php

namespace Hisab\Budgets\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * A goal's target and what feeds it. No "saved" field: progress is read
 * from the ledger, and a posted figure could edit a goal into being reached.
 */
class GoalRequest extends FormRequest
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
            'target_minor' => [$creating ? 'required' : 'sometimes', 'integer', 'min:1', 'max:9000000000000000'],
            'currency' => ['sometimes', 'string', 'size:3', 'exists:currencies,code'],
            'target_on' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'started_on' => ['sometimes', 'date_format:Y-m-d'],
            'account_id' => ['sometimes', 'nullable', 'string', 'size:26'],
            'category_id' => ['sometimes', 'nullable', 'string', 'size:26'],
            'icon' => ['sometimes', 'nullable', 'string', 'in:target,coins,home,globe,card,shield-lock,trend-up,users'],
        ];
    }
}
