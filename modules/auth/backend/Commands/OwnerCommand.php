<?php

namespace Hisab\Auth\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;
use Illuminate\Support\Facades\Validator;

/**
 * Create the owner, or reset the owner's password.
 *
 * This exists so that there is no registration endpoint. On a single-owner app
 * an open registration route is a way in, not a feature — and a "first user
 * becomes the owner" rule is a race with whoever finds the URL first.
 *
 * Interactive on purpose: a password passed as a command-line argument is in the
 * shell history, in the process list while it runs, and quite possibly in a
 * server's audit log.
 */
class OwnerCommand extends Command
{
    protected $signature = 'hisab:owner';

    protected $description = 'Create the owner account, or reset its password';

    public function handle(): int
    {
        $existing = User::query()->first();

        return $existing === null
            ? $this->createOwner()
            : $this->resetPassword($existing);
    }

    private function createOwner(): int
    {
        $this->info('No owner exists yet. Creating one.');

        $name = (string) $this->ask('Name');
        $email = (string) $this->ask('Email');

        $check = Validator::make(['name' => $name, 'email' => $email], [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
        ]);

        if ($check->fails()) {
            foreach ($check->errors()->all() as $message) {
                $this->error($message);
            }

            return self::FAILURE;
        }

        $password = $this->askForPassword();

        if ($password === null) {
            return self::FAILURE;
        }

        User::query()->create([
            'name' => $name,
            'email' => $email,
            'password' => Hash::make($password),
        ]);

        $this->info('Owner created. There will not be a second one.');
        $this->line('Sign in at '.config('app.url').'  —  '.$email);

        return self::SUCCESS;
    }

    private function resetPassword(User $owner): int
    {
        $this->warn('An owner already exists: '.$owner->email);
        $this->line('Hisab has one owner, so this cannot create another.');

        if (! $this->confirm('Reset this owner\'s password instead?', false)) {
            return self::SUCCESS;
        }

        $password = $this->askForPassword();

        if ($password === null) {
            return self::FAILURE;
        }

        $owner->forceFill(['password' => Hash::make($password)])->save();

        // Not the vault. Worth saying out loud at exactly this moment, because
        // "I reset my password" is when someone expects to have recovered
        // access to everything — and the vault is the one thing they have not.
        $this->info('Password reset.');
        $this->newLine();
        $this->warn('This does NOT change the vault master password, and cannot.');
        $this->line('The vault key never reaches the server: only the browser can re-encrypt it.');

        return self::SUCCESS;
    }

    private function askForPassword(): ?string
    {
        $password = (string) $this->secret('Password (hidden)');
        $again = (string) $this->secret('Repeat it');

        if ($password !== $again) {
            $this->error('They do not match.');

            return null;
        }

        // Complexity is enforced HERE, where a password is set, and deliberately
        // not on the login route — see Requests/LoginRequest.php. `uncompromised`
        // checks the k-anonymity range API at haveibeenpwned: only a 5-character
        // prefix of the SHA-1 leaves this machine, never the password.
        $check = Validator::make(['password' => $password], [
            'password' => ['required', 'string', 'max:72', Password::min(12)->uncompromised()],
        ]);

        if ($check->fails()) {
            foreach ($check->errors()->all() as $message) {
                $this->error($message);
            }

            return null;
        }

        return $password;
    }
}
