<?php

namespace Hisab\Accounts\Requests;

use Hisab\Accounts\Models\Account;
use Illuminate\Validation\Rule;

/**
 * The rules for an account's details, shared by create and update so the two
 * cannot accept different things.
 *
 * STILL NO BALANCE. `statement_balance_minor` is what a bank statement said on
 * `statement_on` - an input the owner reads off paper - and it never becomes
 * the account's balance, which stays derived from the ledger.
 */
final class AccountDetailRules
{
    /** @return array<string, mixed> */
    public static function rules(): array
    {
        return [
            'branch' => ['sometimes', 'nullable', 'string', 'max:120'],
            'holder_name' => ['sometimes', 'nullable', 'string', 'max:120'],
            // Digits, spaces and dashes, up to an IBAN's 34. A wallet number
            // (01712-345678) is the same shape.
            'account_number' => ['sometimes', 'nullable', 'string', 'max:34', 'regex:/^[0-9A-Za-z \-]+$/'],
            'bank_account_type' => ['sometimes', 'nullable', Rule::in(Account::BANK_ACCOUNT_TYPES)],
            // A Bangladeshi routing number is nine digits; left loose for others.
            'routing_number' => ['sometimes', 'nullable', 'string', 'max:16', 'regex:/^[0-9]+$/'],
            'card_network' => ['sometimes', 'nullable', Rule::in(Account::CARD_NETWORKS)],
            'statement_day' => ['sometimes', 'nullable', 'integer', 'between:1,31'],
            'colour' => ['sometimes', 'nullable', Rule::in(Account::COLOURS)],
            'notes' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'statement_balance_minor' => ['sometimes', 'nullable', 'integer'],
            'statement_on' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
        ];
    }
}
