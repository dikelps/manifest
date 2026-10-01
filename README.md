# Makerbook

Makerbook is a single-maker deployment of [Manifest](https://github.com/Bonasa-Tech/manifest).
Only the compiled maker can maintain resting liquidity; public takers execute
through the upstream `Swap` and `SwapV2` instructions. The fork keeps Manifest's
matching and settlement code and restricts admission to persistent maker state.

## Program contract

The base is upstream commit
[`ec9cd449857c837a993e348df8b734dfc3717a49`](https://github.com/Bonasa-Tech/manifest/tree/ec9cd449857c837a993e348df8b734dfc3717a49).
The core source changes are confined to three files:

| File                                                                     | Change                                                                                   |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| [`claim_seat.rs`](programs/manifest/src/program/processor/claim_seat.rs) | Reject any signer other than the compiled maker before creating persistent state.        |
| [`lib.rs`](programs/manifest/src/lib.rs)                                 | Bind the new program ID and identify this fork in its security metadata.                 |
| [`utils.rs`](programs/manifest/src/utils.rs)                             | Retain Manifest's account/event discriminant namespace under the new runtime program ID. |

The maker is `7Dzpq37VVnmar38oRvq5XhvfZXyg8DvHQRBUdxMiXBnb`. This is one
compiled identity across markets. Subsequent order updates, deposits, and
withdrawals use upstream signer ownership checks. Public swaps create temporary
IOC state when needed and release it before returning; takers do not need maker
authorization.

The [scope check](scripts/verify-makerbook-program-scope.sh) rejects changes to
other core sources, the shared tree library, Cargo manifests/lockfile, and
toolchain settings. It also checks that generated IDL and TypeScript instruction
bindings match the upstream files after program-ID substitution and formatting.
The three permitted source diffs are reviewed in the PR.

## Public swap integration

Makerbook retains upstream instruction layouts, account layouts, matching math,
and event bytes. Integrators must use the Makerbook program ID for account
ownership, CPI dispatch, and vault/global PDA derivation. Existing upstream
Manifest market addresses and wrappers target a different program.

This PR covers the core program and its devnet execution evidence. Jupiter
integration requires registration of the new program ID and quote-parity tests
against its current interface. The inherited `client/rust/jup` adapter is retained
as reference source, excluded from the active workspace, and pinned to
`jupiter-amm-interface` 0.5.1; it is not the adapter submission for this deployment.

## Devnet deployment and evidence

| Item            | Value                                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Program         | [`HcdpMTGRaKNaZEzRiPWyegVMzbw1rK92zhf6uDgBfGzJ`](https://explorer.solana.com/address/HcdpMTGRaKNaZEzRiPWyegVMzbw1rK92zhf6uDgBfGzJ?cluster=devnet) |
| Test market     | [`2ECnMaB9DYGEENVBLzVkHi4NTwwdqccWdCWLiEMWjZGa`](https://explorer.solana.com/address/2ECnMaB9DYGEENVBLzVkHi4NTwwdqccWdCWLiEMWjZGa?cluster=devnet) |
| Deployed source | `bdf501120a64c035f16d3f27563c50a2bb4b6fe6`                                                                                                        |
| ELF SHA-256     | `fcf828a3ec3d8ea672c5897f8f6db576d18baa07ca5c80a6ac08c9f031de3c9e`                                                                                |

Two clean builds and the dumped devnet executable were byte-identical. Finalized
transactions show unauthorized maker admission rejected, the authorized maker's
deposit/order/cancel/withdraw lifecycle completed, and public `Swap` and `SwapV2`
execution with reconciled balances. See the [validation record](docs/makerbook-devnet-validation.md)
for build provenance, authorities, transaction links, and the exact test coverage.
The deployment is upgradeable under the authority recorded there.

## License and upstream reference

Makerbook retains Manifest's GPL-3.0 license and source attribution. See
[FORK_NOTICE.md](FORK_NOTICE.md) for the fork boundary and [LICENSE](LICENSE) for
the license. The upstream audit does not cover Makerbook's authorization change.
Manifest's original design and operational documentation are available in the
[pinned upstream README](https://github.com/Bonasa-Tech/manifest/blob/ec9cd449857c837a993e348df8b734dfc3717a49/README.md).
