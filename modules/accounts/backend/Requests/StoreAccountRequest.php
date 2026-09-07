<?php

namespace Hisab\Accounts\Requests;

use Hisab\Accounts\Models\Account;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreAccountRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * NOTE WHAT IS ABSENT: balance, available, or any other derived figure.
     * CONVENTIONS.md requires them to have no field at all rather than be
     * validated-and-ignored, so one cannot be smuggled in by accident. A ledger
     * that trusts a posted balance is a ledger that can be edited into anything.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            // The client mints the id so a record created offline has its final
            // identity immediately. Re-validated here as a well-formed UPPERCASE
            // ULID - the casing the frontend produces and its isUlid() enforces -
            // and as unused, so a client cannot overwrite an existing row by
            // posting its id.
            'id' => [
                'sometimes', 'string', 'size:26', 'regex:/^[0-9A-HJKMNP-TV-Z]{26}$/',
                Rule::unique('accounts', 'id'),
            ],

            'name' => ['required', 'string', 'max:120'],
            'type' => ['required', Rule::in(Account::TYPES)],
            'currency' => ['required', 'string', 'size:3', Rule::exists('currencies', 'code')],
            'book' => ['sometimes', 'string', 'max:32'],

            // An integer in the currency's minor unit, and signed: an account can
            // legitimately open overdrawn, and a card almost always does.
            'opening_balance_minor' => ['sometimes', 'integer'],
            'opening_on' => ['sometimes', 'nullable', 'date_format:Y-m-d'],

            'institution' => ['sometimes', 'nullable', 'string', 'max:120'],

            // The last few digits, never the full number - this exists to tell
            // two cards apart in a picker, not to make a payment.
            'number_tail' => ['sometimes', 'nullable', 'string', 'max:8'],

            // Only meaningful on a card; AccountBook nulls it otherwise. min:0
            // because a negative limit is not a limit.
            'credit_limit_minor' => ['sometimes', 'nullable', 'integer', 'min:0'],

            'is_default' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer', 'min:0'],
        ];
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('currency')) {
            $this->merge(['currency' => strtoupper((string) $this->input('currency'))]);
        }
        if ($this->has('id')) {
            $this->merge(['id' => strtoupper((string) $this->input('id'))]);
        }
    }
}
