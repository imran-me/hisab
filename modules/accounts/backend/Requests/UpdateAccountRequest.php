<?php

namespace Hisab\Accounts\Requests;

use Hisab\Accounts\Models\Account;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Rename, re-type, re-order, archive, restore.
 *
 * TWO FIELDS ARE DELIBERATELY ABSENT, and both for the same reason - they would
 * rewrite history rather than correct it:
 *
 *   `book`     an account never moves between books. A business account that
 *              becomes personal is a real financial event (a drawing), and
 *              re-labelling it would rewrite the history of BOTH books.
 *   `currency` every transaction on the account is an integer in the currency's
 *              minor unit. Changing the currency reinterprets every one of them
 *              at once - 500 poisha silently becoming 500 fils - and the ledger
 *              still adds up, which is what makes it dangerous.
 *
 * The answer to either is a new account and a transfer, which leaves both
 * histories intact and visible.
 */
class UpdateAccountRequest extends FormRequest
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
            'name' => ['sometimes', 'string', 'max:120'],
            'type' => ['sometimes', Rule::in(Account::TYPES)],
            'opening_balance_minor' => ['sometimes', 'integer'],
            'opening_on' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'institution' => ['sometimes', 'nullable', 'string', 'max:120'],
            'number_tail' => ['sometimes', 'nullable', 'string', 'max:8'],
            'credit_limit_minor' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'is_default' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer', 'min:0'],

            // Archive and restore are the same field, because they are one
            // decision with two directions. A separate /archive endpoint and a
            // /restore endpoint would be two routes that must not disagree.
            'archived' => ['sometimes', 'boolean'],
        ];
    }
}
