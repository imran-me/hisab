<?php

namespace Hisab\Ledger\Requests;

use Hisab\Ledger\Models\Transaction;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Editing rewrites the pair, so this takes the same fields as creating - minus
 * `id`, which is the one thing an edit cannot change.
 */
class UpdateTransactionRequest extends FormRequest
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
            'type' => ['sometimes', Rule::in(Transaction::TYPES)],
            'account_id' => ['sometimes', 'string', $ownedAccount],
            'to_account_id' => ['sometimes', 'nullable', 'string', 'different:account_id', $ownedAccount],
            'amount_minor' => ['sometimes', 'integer', 'min:1'],
            'currency' => ['sometimes', 'string', 'size:3', Rule::exists('currencies', 'code')],
            'category_id' => [
                'sometimes', 'nullable', 'string',
                Rule::exists('categories', 'id')->where('user_id', $this->user()->id),
            ],
            'necessity' => ['sometimes', 'nullable', 'integer', Rule::exists('necessity_bands', 'band')],
            'method' => ['sometimes', 'nullable', 'string', Rule::exists('payment_methods', 'key')],
            'payee' => ['sometimes', 'nullable', 'string', 'max:160'],
            'note' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'occurred_on' => ['sometimes', 'date_format:Y-m-d'],
            'book' => ['sometimes', 'string', 'max:32'],
            'fx_rate_id' => ['sometimes', 'nullable', 'string', Rule::exists('fx_rates', 'id')],

            // Why the correction was made. Recorded on the reversal, in the
            // person's own words, beside the row it explains.
            'reason' => ['sometimes', 'nullable', 'string', 'max:160'],
        ];
    }

    protected function prepareForValidation(): void
    {
        foreach (['currency', 'fx_rate_id'] as $field) {
            if ($this->filled($field)) {
                $this->merge([$field => strtoupper((string) $this->input($field))]);
            }
        }
    }
}
