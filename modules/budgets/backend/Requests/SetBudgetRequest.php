<?php

namespace Hisab\Budgets\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Setting a category's limit.
 *
 * There is no field for what has been spent: it is derived from the ledger,
 * and a request that carried it could be used to edit a budget into looking
 * healthy (CONVENTIONS.md, "the client never sets a derived figure").
 */
class SetBudgetRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            // At least one minor unit. A zero budget reads as "spend nothing",
            // which is a DELETE, not a limit.
            'amount_minor' => ['required', 'integer', 'min:1', 'max:9000000000000000'],
            'currency' => ['sometimes', 'string', 'size:3', 'exists:currencies,code'],
        ];
    }
}
