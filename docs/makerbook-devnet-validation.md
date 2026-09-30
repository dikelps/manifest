# Makerbook devnet validation

This document records the reproducible build, deployment, and behavioral smoke
test for the minimal single-maker fork. It is evidence for the exact devnet
revision below; it is not a claim of mainnet readiness or an extension of the
upstream audit.

## Build and deployment

| Item                     | Value                                                                                                                                                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source commit            | `bdf501120a64c035f16d3f27563c50a2bb4b6fe6`                                                                                                                                                                                         |
| Upstream base            | `ec9cd449857c837a993e348df8b734dfc3717a49`                                                                                                                                                                                         |
| Program ID               | [`HcdpMTGRaKNaZEzRiPWyegVMzbw1rK92zhf6uDgBfGzJ`](https://explorer.solana.com/address/HcdpMTGRaKNaZEzRiPWyegVMzbw1rK92zhf6uDgBfGzJ?cluster=devnet)                                                                                  |
| ProgramData              | `A7LLw7Y4mPZGuJVVWgAFUBL64U8kijfR8JmyzUwzhFsN`                                                                                                                                                                                     |
| Devnet upgrade authority | `9Tkx8soiBp6Lf3Yh8dzsQTeBZcDuNxGFqctSkpQDVJur`                                                                                                                                                                                     |
| Compiled maker           | `7Dzpq37VVnmar38oRvq5XhvfZXyg8DvHQRBUdxMiXBnb`                                                                                                                                                                                     |
| Deployment slot          | `506041542`                                                                                                                                                                                                                        |
| Deployment transaction   | [`Whr1LuMgpN1ZtJYYEKheSD9JESwz33RjLv9Hsq6rojpqFvF27rsUbw8uQMLBvqzPf9rXR8Mc5LwFhud4x866Hcb`](https://explorer.solana.com/tx/Whr1LuMgpN1ZtJYYEKheSD9JESwz33RjLv9Hsq6rojpqFvF27rsUbw8uQMLBvqzPf9rXR8Mc5LwFhud4x866Hcb?cluster=devnet) |
| ELF length               | `328488` bytes                                                                                                                                                                                                                     |
| ELF SHA-256              | `fcf828a3ec3d8ea672c5897f8f6db576d18baa07ca5c80a6ac08c9f031de3c9e`                                                                                                                                                                 |

The build used SBF architecture v3, platform-tools v1.57, Cargo `--locked`, and
the pinned image:

```text
solanafoundation/solana-verifiable-build@sha256:12fd4c0a0790f0fc41ef74b0cdb6bccc167ba6137eb1adb749bac649481c86bd
```

Two independent clean clones at the source commit produced byte-identical ELF
files. The executable was then dumped back from devnet; that dump was also
byte-identical and had the same SHA-256.

The upgrade authority is deliberately different from the compiled maker. The
devnet authority is temporary. A mainnet deployment should replace it with the
chosen cold multisig/timelock policy, or revoke it after stabilization; every
upgrade would establish a new code revision and review boundary.

## Behavioral smoke test

The reproducible harness is
[`scripts/makerbook-devnet-smoke.ts`](../scripts/makerbook-devnet-smoke.ts).
The machine-readable result is
[`docs/evidence/makerbook-devnet-smoke-20260930.json`](evidence/makerbook-devnet-smoke-20260930.json).

Run it with funded devnet-only keypairs; the output redacts the RPC credential:

```bash
DEVNET_RPC_URL='<devnet RPC URL>' \
DEVNET_PAYER_KEYPAIR='<devnet payer keypair path>' \
MAKERBOOK_MAKER_KEYPAIR='<compiled maker keypair path>' \
MAKERBOOK_SMOKE_OUTPUT='<evidence JSON path>' \
npx tsx scripts/makerbook-devnet-smoke.ts
```

The test created market
[`2ECnMaB9DYGEENVBLzVkHi4NTwwdqccWdCWLiEMWjZGa`](https://explorer.solana.com/address/2ECnMaB9DYGEENVBLzVkHi4NTwwdqccWdCWLiEMWjZGa?cluster=devnet)
with ordinary SPL Token base and quote mints, then established these facts:

1. A random signer was rejected by `ClaimSeat` with
   `InvalidAccountData`, and no persistent seat was created:
   [`5uZYGE2by3UZb6i2MysjZ8ppA3phPHjAfhyGtg5NB2DYEwu5aHqg1JjAAbbtHgzSaESi9tQHL2LPwtw1MEjkK2T6`](https://explorer.solana.com/tx/5uZYGE2by3UZb6i2MysjZ8ppA3phPHjAfhyGtg5NB2DYEwu5aHqg1JjAAbbtHgzSaESi9tQHL2LPwtw1MEjkK2T6?cluster=devnet).
2. The compiled maker claimed the persistent seat:
   [`2ofNQL2VKhmUUZHec4XzS8NeWx1fRZ2ktrvZv8hLW3tHrunZHrUe2cGosABkvMoHmYwjauBq7pKt6HTribUn2t9s`](https://explorer.solana.com/tx/2ofNQL2VKhmUUZHec4XzS8NeWx1fRZ2ktrvZv8hLW3tHrunZHrUe2cGosABkvMoHmYwjauBq7pKt6HTribUn2t9s?cluster=devnet).
3. The maker deposited both assets and used a direct core `BatchUpdate` to
   place one bid and one ask:
   [`N8oTtqoJk8ehjbVUzX6LidxXutYqfPSphW7TPAn8G6faC58tex3TVQfrmSUgFRYPi2DsZdjxtLfETcdxYHrTtZx`](https://explorer.solana.com/tx/N8oTtqoJk8ehjbVUzX6LidxXutYqfPSphW7TPAn8G6faC58tex3TVQfrmSUgFRYPi2DsZdjxtLfETcdxYHrTtZx?cluster=devnet),
   [`3UZ6SvQmpm3Q1q5d1enMgek28DUyawjjk6yyLPoXMSLTsRFyZFuBUGwxwxsP95YsMY7XpZeQ5hh4RG7K2KmpniDD`](https://explorer.solana.com/tx/3UZ6SvQmpm3Q1q5d1enMgek28DUyawjjk6yyLPoXMSLTsRFyZFuBUGwxwxsP95YsMY7XpZeQ5hh4RG7K2KmpniDD?cluster=devnet).
4. An arbitrary public taker bought one base token through ordinary `Swap`:
   [`3K3DQ5kTBesVpTcsEWnZ4q3VBwja5F7MPyVd5qmuWE6x6PSXre7dAUqM7WNfW76w7b4vquVjpUQN88r5tLLWsaje`](https://explorer.solana.com/tx/3K3DQ5kTBesVpTcsEWnZ4q3VBwja5F7MPyVd5qmuWE6x6PSXre7dAUqM7WNfW76w7b4vquVjpUQN88r5tLLWsaje?cluster=devnet).
5. The same arbitrary owner bought another base token through `SwapV2` with a
   separate gas payer:
   [`3sqxoUgTxK1DTxi38qEULXzNPaHm93SBwbAyCdYJR51G5fRMbbsBWfWjPjX2htMgs4pBvdods39eqTXitgigCcgy`](https://explorer.solana.com/tx/3sqxoUgTxK1DTxi38qEULXzNPaHm93SBwbAyCdYJR51G5fRMbbsBWfWjPjX2htMgs4pBvdods39eqTXitgigCcgy?cluster=devnet).
6. Neither public swap left a persistent taker seat. The maker then canceled
   the remaining orders and withdrew all market balances:
   [`tgdpym4mVJoUshY8YxVrwQxFXaabe74fw54hWc3CfpcEh14ziCGrdMTTmp2K4F3Exk3Wj1vmG6S1wwx9KbomyH8`](https://explorer.solana.com/tx/tgdpym4mVJoUshY8YxVrwQxFXaabe74fw54hWc3CfpcEh14ziCGrdMTTmp2K4F3Exk3Wj1vmG6S1wwx9KbomyH8?cluster=devnet),
   [`2rLX1HL2k7BefxYatVx4oKeFh3kM3Q23f1kQmtnA6So4vwRtjLWuTP5JcZA42jdBcVyxUXReADDF7yvJq4wNsh4W`](https://explorer.solana.com/tx/2rLX1HL2k7BefxYatVx4oKeFh3kM3Q23f1kQmtnA6So4vwRtjLWuTP5JcZA42jdBcVyxUXReADDF7yvJq4wNsh4W?cluster=devnet).

All successful transactions finalized without error; the unauthorized
transaction finalized with the expected error. The final market had zero open
orders and zero maker-withdrawable balance. Token-account arithmetic also
reconciled: the maker sold two base tokens for four quote tokens, and the taker
received two base tokens while spending four quote tokens.

## Scope of this evidence

The harness calls the core program directly. It deliberately does not rely on
the already-deployed upstream wrapper, which is bound to the upstream Manifest
program ID. A maker controller can use the core instructions directly; using a
reference wrapper would require a separately rebound wrapper deployment and its
own review.

This smoke test covers the authorization boundary, ordinary SPL Token custody,
direct deposits/withdrawals, direct batch placement/cancellation, and both
public swap account shapes. Token-2022 extensions, global orders, reverse
orders, production load, and Jupiter indexing/integration remain separate test
and review steps.
