# Jupiter CLI (jupjup)

What the CLI is trained to do:

- Assist in setting up token accounts for most traded tokens, useful for fee accounts to receive the platform fee
- Convert spill or fee tokens back to desired mint
- Provide the level of hygiene of a wallet

## Usage

Locate or [setup your file system wallet](https://docs.solana.com/wallet-guide/file-system-wallet#:~:text=A%20file%20system%20wallet%20exists,system%20wallet%20is%20not%20recommended.) file.

Run `npx jupjup help` to see all the commands. You can also run `npx . help command` to see what each command is for.

### Example

`npx jupjup swap-tokens --keypair wallet.json`

## Running locally

1. Clone the repository
2. Install all the dependencies with `pnpm`
3. Ensure you have a file system wallet as described above
4. Run `npx . help` to see all the commands. You will need to run `pnpm build` after making any changes to the code, before running `npx .` again.
