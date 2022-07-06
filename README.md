# Jupiter CLI

What the CLI is trained to do:

- Assist in setting up token accounts for most traded tokens, useful for fee accounts to receive the platform fee
- Convert spill or fee tokens back to desired mint
- Provide the level of hygiene of a wallet

## To start

1. You first need to install all the dependencies with `yarn`.
2. Locate or [setup your file system wallet](https://docs.solana.com/wallet-guide/file-system-wallet#:~:text=A%20file%20system%20wallet%20exists,system%20wallet%20is%20not%20recommended.) file
3. Run `yarn start help` to see all the commands. You can also run `yarn start help command` to see what each command is for.

## Example

`yarn start swap-tokens --keypair wallet.json`
