<?php

namespace Hisab\Ledger\Requests;

use Hisab\Ledger\Models\Transaction;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * NOTE WHAT IS ABSENT: `direction`, `group_id`, and every running total.
 *
 * All of them are derived server-side from `type` and the accounts named.
 * CONVENTIONS.md requires a derived figure to have NO FIELD rather than be
 * validated-and-ignored, so one cannot be smuggled in by accident. A client
 * that can post a direction can post an `in` leg for an expense and quietly
 * add money to its own ledger.
 */
class StoreTransactionRequest extends FormRequest
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
        $ownedAccount = Rule::exists('accounts', 'id')->where('user_id', $this->user()->id);

        return [
            'id' => [
                'sometimes', 'string', 'size:26', 'regex:/^[0-9A-HJKMNP-TV-Z]{26}$/',
                Rule::unique('transactions', 'id'),
            ],

            'type' => ['required', Rule::in(Transaction::TYPES)],

            // Scoped to this owner, so a valid id belonging to someone else
            // fails validation rather than reaching the writer.
            'account_id' => ['required', 'string', $ownedAccount],

            // required_if rather than nullable: a transfer with nowhere to go is
            // not a transfer, and catching it here gives the field the error
            // instead of a generic one.
            'to_account_id' => [
                'nullable', 'string', 'different:account_id', $ownedAccount,
                Rule::requiredIf(fn (): bool => $this->input('type') === 'transfer'),
            ],

            // Positive, always. The sign lives in `direction`, which the server
            // sets. min:1 and not min:0 because a zero-amount transaction is not
            // a record of anything and silently pollutes every count.
            'amount_minor' => ['required', 'integer', 'min:1'],

            'currency' => ['required', 'string', 'size:3', Rule::exists('currencies', 'code')],

            'category_id' => [
                'nullable', 'string',
                Rule::exists('categories', 'id')->where('user_id', $this->user()->id),
            ],

            'necessity' => ['nullable', 'integer', Rule::exists('necessity_bands', 'band')],
            'method' => ['nullable', 'string', Rule::exists('payment_methods', 'key')],

            'payee' => ['nullable', 'string', 'max:160'],
            'note' => ['nullable', 'string', 'max:2000'],
            // 'Monthly', 'Weekly', 'Yearly' - a label, never a schedule.
            'recurring' => ['sometimes', 'nullable', 'string', 'max:16'],

            'occurred_on' => ['required', 'date_format:Y-m-d'],
            'book' => ['sometimes', 'string', 'max:32'],

            // The RATE ID, never a rate. api-contract.md §7: a client that can
            // post its own rate can post any figure it likes into a converted
            // total, which is the same problem as posting a balance.
            'fx_rate_id' => ['nullable', 'string', Rule::exists('fx_rates', 'id')],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'to_account_id.different' => 'Money cannot be transferred to the account it came from.',
            'amount_minor.min' => 'Enter an amount greater than zero.',
        ];
    }

    protected function prepareForValidation(): void
    {
        foreach (['id', 'currency', 'fx_rate_id'] as $field) {
            if ($this->filled($field)) {
                $this->merge([$field => strtoupper((string) $this->input($field))]);
            }
        }
    }
}
