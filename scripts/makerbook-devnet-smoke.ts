import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  Connection,
  Keypair,
  PublicKey,
  SendTransactionError,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotent,
  createMint,
  getAccount,
  mintTo,
} from '@solana/spl-token';

import { ManifestClient } from '../client/ts/src/client';
import { FIXED_MANIFEST_HEADER_SIZE } from '../client/ts/src/constants';
import {
  PROGRAM_ID,
  createBatchUpdateInstruction,
  createClaimSeatInstruction,
  createCreateMarketInstruction,
} from '../client/ts/src/manifest';
import { OrderType } from '../client/ts/src/manifest/types';
import { Market } from '../client/ts/src/market';
import { getVaultAddress } from '../client/ts/src/utils/market';

const COMMITMENT = 'confirmed' as const;
const DEFAULT_RPC = 'https://api.devnet.solana.com';
const AUTHORIZED_MAKER = new PublicKey(
  '7Dzpq37VVnmar38oRvq5XhvfZXyg8DvHQRBUdxMiXBnb',
);

type Evidence = {
  schema: 'makerbook.devnet-smoke.v1';
  generatedAt: string;
  rpcEndpoint: string;
  programId: string;
  payer: string;
  authorizedMaker: string;
  unauthorizedMaker: string;
  publicTaker: string;
  market: string;
  baseMint: string;
  quoteMint: string;
  signatures: Record<string, string>;
  assertions: Record<string, boolean>;
  final: {
    makerBaseWalletAtoms: string;
    makerQuoteWalletAtoms: string;
    takerBaseWalletAtoms: string;
    takerQuoteWalletAtoms: string;
    openOrderCount: number;
  };
};

function loadKeypair(path: string): Keypair {
  const bytes = JSON.parse(fs.readFileSync(path, 'utf8')) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function send(
  connection: Connection,
  transaction: Transaction,
  signers: Keypair[],
): Promise<string> {
  return sendAndConfirmTransaction(connection, transaction, signers, {
    commitment: COMMITMENT,
    preflightCommitment: COMMITMENT,
  });
}

async function sendExpectedFailure(
  connection: Connection,
  transaction: Transaction,
  feePayer: Keypair,
  signers: Keypair[],
  expectedLog: string,
): Promise<string> {
  const latest = await connection.getLatestBlockhash(COMMITMENT);
  transaction.feePayer = feePayer.publicKey;
  transaction.recentBlockhash = latest.blockhash;
  transaction.sign(feePayer, ...signers);

  const signature = await connection.sendRawTransaction(
    transaction.serialize(),
    { skipPreflight: true, maxRetries: 5 },
  );
  const confirmation = await connection.confirmTransaction(
    { signature, ...latest },
    COMMITMENT,
  );
  assert.notEqual(
    confirmation.value.err,
    null,
    'unauthorized ClaimSeat unexpectedly succeeded',
  );

  const result = await connection.getTransaction(signature, {
    commitment: COMMITMENT,
    maxSupportedTransactionVersion: 0,
  });
  assert(result?.meta?.err, 'failed transaction has no recorded error');
  assert(
    result.meta.logMessages?.some((line: string) => line.includes(expectedLog)),
    `failed transaction did not log ${JSON.stringify(expectedLog)}`,
  );
  return signature;
}

function amountInstructionData(
  discriminator: 2 | 3,
  amountAtoms: bigint,
): Buffer {
  const data = Buffer.alloc(10);
  data.writeUInt8(discriminator, 0);
  data.writeBigUInt64LE(amountAtoms, 1);
  data.writeUInt8(0, 9); // trader_index_hint: None
  return data;
}

function amountInstruction(args: {
  discriminator: 2 | 3;
  amountAtoms: bigint;
  owner: PublicKey;
  market: PublicKey;
  mint: PublicKey;
  traderToken: PublicKey;
}): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: args.owner, isSigner: true, isWritable: false },
      { pubkey: args.market, isSigner: false, isWritable: true },
      { pubkey: args.traderToken, isSigner: false, isWritable: true },
      {
        pubkey: getVaultAddress(args.market, args.mint),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: args.mint, isSigner: false, isWritable: false },
    ],
    data: amountInstructionData(args.discriminator, args.amountAtoms),
  });
}

function swapV2Instruction(args: {
  payer: PublicKey;
  owner: PublicKey;
  market: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  traderBase: PublicKey;
  traderQuote: PublicKey;
  inAtoms: bigint;
  outAtoms: bigint;
  isBaseIn: boolean;
  isExactIn: boolean;
}): TransactionInstruction {
  const data = Buffer.alloc(19);
  data.writeUInt8(13, 0); // ManifestInstruction::SwapV2
  data.writeBigUInt64LE(args.inAtoms, 1);
  data.writeBigUInt64LE(args.outAtoms, 9);
  data.writeUInt8(args.isBaseIn ? 1 : 0, 17);
  data.writeUInt8(args.isExactIn ? 1 : 0, 18);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: args.payer, isSigner: true, isWritable: true },
      { pubkey: args.owner, isSigner: true, isWritable: true },
      { pubkey: args.market, isSigner: false, isWritable: true },
      {
        pubkey: SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: args.traderBase, isSigner: false, isWritable: true },
      { pubkey: args.traderQuote, isSigner: false, isWritable: true },
      {
        pubkey: getVaultAddress(args.market, args.baseMint),
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: getVaultAddress(args.market, args.quoteMint),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });
}

function atoms(value: unknown): bigint {
  return BigInt(String(value));
}

async function main(): Promise<void> {
  const rpcUrl = process.env.DEVNET_RPC_URL ?? DEFAULT_RPC;
  const parsedRpcUrl = new URL(rpcUrl);
  const rpcEndpoint = `${parsedRpcUrl.protocol}//${parsedRpcUrl.host}/v2/<redacted>`;
  const payer = loadKeypair(requiredEnv('DEVNET_PAYER_KEYPAIR'));
  const maker = loadKeypair(requiredEnv('MAKERBOOK_MAKER_KEYPAIR'));
  assert(
    maker.publicKey.equals(AUTHORIZED_MAKER),
    `maker key is ${maker.publicKey}, expected ${AUTHORIZED_MAKER}`,
  );

  const connection = new Connection(rpcUrl, COMMITMENT);
  const program = await connection.getAccountInfo(PROGRAM_ID, COMMITMENT);
  assert(program?.executable, `program ${PROGRAM_ID} is not executable`);

  const unauthorized = Keypair.generate();
  const taker = Keypair.generate();
  const signatures: Record<string, string> = {};

  signatures.fundActors = await send(
    connection,
    new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: maker.publicKey,
        lamports: 100_000_000,
      }),
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: unauthorized.publicKey,
        lamports: 20_000_000,
      }),
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: taker.publicKey,
        lamports: 50_000_000,
      }),
    ),
    [payer],
  );

  const baseMint = await createMint(
    connection,
    payer,
    payer.publicKey,
    null,
    6,
    undefined,
    { commitment: COMMITMENT },
  );
  const quoteMint = await createMint(
    connection,
    payer,
    payer.publicKey,
    null,
    6,
    undefined,
    { commitment: COMMITMENT },
  );

  const market = Keypair.generate();
  const createMarket = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: market.publicKey,
      space: FIXED_MANIFEST_HEADER_SIZE,
      lamports: await connection.getMinimumBalanceForRentExemption(
        FIXED_MANIFEST_HEADER_SIZE,
      ),
      programId: PROGRAM_ID,
    }),
    createCreateMarketInstruction({
      payer: payer.publicKey,
      market: market.publicKey,
      baseMint,
      quoteMint,
      baseVault: getVaultAddress(market.publicKey, baseMint),
      quoteVault: getVaultAddress(market.publicKey, quoteMint),
      tokenProgram: TOKEN_PROGRAM_ID,
      tokenProgram22: TOKEN_2022_PROGRAM_ID,
    }),
  );
  signatures.createMarket = await send(connection, createMarket, [
    payer,
    market,
  ]);

  signatures.unauthorizedClaimSeat = await sendExpectedFailure(
    connection,
    new Transaction().add(
      createClaimSeatInstruction({
        payer: unauthorized.publicKey,
        market: market.publicKey,
      }),
    ),
    payer,
    [unauthorized],
    'Maker is not authorized',
  );

  let marketState = await Market.loadFromAddress({
    connection,
    address: market.publicKey,
  });
  assert(!marketState.hasSeat(unauthorized.publicKey));
  assert(!marketState.hasSeat(maker.publicKey));

  signatures.authorizedClaimSeat = await send(
    connection,
    new Transaction().add(
      createClaimSeatInstruction({
        payer: maker.publicKey,
        market: market.publicKey,
      }),
    ),
    [payer, maker],
  );

  marketState = await Market.loadFromAddress({
    connection,
    address: market.publicKey,
  });
  assert(marketState.hasSeat(maker.publicKey));

  const makerBase = await createAssociatedTokenAccountIdempotent(
    connection,
    payer,
    baseMint,
    maker.publicKey,
  );
  const makerQuote = await createAssociatedTokenAccountIdempotent(
    connection,
    payer,
    quoteMint,
    maker.publicKey,
  );
  const takerBase = await createAssociatedTokenAccountIdempotent(
    connection,
    payer,
    baseMint,
    taker.publicKey,
  );
  const takerQuote = await createAssociatedTokenAccountIdempotent(
    connection,
    payer,
    quoteMint,
    taker.publicKey,
  );

  await mintTo(connection, payer, baseMint, makerBase, payer, 20_000_000);
  await mintTo(connection, payer, quoteMint, makerQuote, payer, 40_000_000);
  await mintTo(connection, payer, quoteMint, takerQuote, payer, 10_000_000);

  signatures.deposit = await send(
    connection,
    new Transaction().add(
      amountInstruction({
        discriminator: 2,
        amountAtoms: 10_000_000n,
        owner: maker.publicKey,
        market: market.publicKey,
        mint: baseMint,
        traderToken: makerBase,
      }),
      amountInstruction({
        discriminator: 2,
        amountAtoms: 20_000_000n,
        owner: maker.publicKey,
        market: market.publicKey,
        mint: quoteMint,
        traderToken: makerQuote,
      }),
    ),
    [payer, maker],
  );

  signatures.batchPlace = await send(
    connection,
    new Transaction().add(
      createBatchUpdateInstruction(
        { payer: maker.publicKey, market: market.publicKey },
        {
          params: {
            traderIndexHint: null,
            cancels: [],
            orders: [
              {
                baseAtoms: 5_000_000,
                priceMantissa: 1,
                priceExponent: 0,
                isBid: true,
                lastValidSlot: 0,
                orderType: OrderType.Limit,
              },
              {
                baseAtoms: 5_000_000,
                priceMantissa: 2,
                priceExponent: 0,
                isBid: false,
                lastValidSlot: 0,
                orderType: OrderType.Limit,
              },
            ],
          },
        },
      ),
    ),
    [payer, maker],
  );

  marketState = await Market.loadFromAddress({
    connection,
    address: market.publicKey,
  });
  assert.equal(marketState.bids().length, 1);
  assert.equal(marketState.asks().length, 1);

  const readOnlyClient = await ManifestClient.getClientReadOnly(
    connection,
    market.publicKey,
  );
  signatures.publicSwap = await send(
    connection,
    new Transaction().add(
      readOnlyClient.swapIx(taker.publicKey, {
        inAtoms: 2_000_000,
        outAtoms: 900_000,
        isBaseIn: false,
        isExactIn: true,
      }),
    ),
    [payer, taker],
  );

  marketState = await Market.loadFromAddress({
    connection,
    address: market.publicKey,
  });
  assert(!marketState.hasSeat(taker.publicKey));
  assert(
    atoms(marketState.getWithdrawableBalanceAtoms(maker.publicKey, false)) >=
      2_000_000n,
  );
  assert((await getAccount(connection, takerBase)).amount >= 1_000_000n);

  signatures.publicSwapV2 = await send(
    connection,
    new Transaction().add(
      swapV2Instruction({
        payer: payer.publicKey,
        owner: taker.publicKey,
        market: market.publicKey,
        baseMint,
        quoteMint,
        traderBase: takerBase,
        traderQuote: takerQuote,
        inAtoms: 2_000_000n,
        outAtoms: 900_000n,
        isBaseIn: false,
        isExactIn: true,
      }),
    ),
    [payer, taker],
  );

  marketState = await Market.loadFromAddress({
    connection,
    address: market.publicKey,
  });
  assert(!marketState.hasSeat(taker.publicKey));
  assert(
    atoms(marketState.getWithdrawableBalanceAtoms(maker.publicKey, false)) >=
      4_000_000n,
  );
  assert((await getAccount(connection, takerBase)).amount >= 2_000_000n);

  const remainingOrders = marketState
    .openOrders()
    .filter((order) => order.trader.equals(maker.publicKey));
  signatures.batchCancel = await send(
    connection,
    new Transaction().add(
      createBatchUpdateInstruction(
        { payer: maker.publicKey, market: market.publicKey },
        {
          params: {
            traderIndexHint: null,
            cancels: remainingOrders.map((order) => ({
              orderSequenceNumber: order.sequenceNumber,
              orderIndexHint: order.dataIndex ?? null,
            })),
            orders: [],
          },
        },
      ),
    ),
    [payer, maker],
  );

  marketState = await Market.loadFromAddress({
    connection,
    address: market.publicKey,
  });
  assert.equal(
    marketState
      .openOrders()
      .filter((order) => order.trader.equals(maker.publicKey)).length,
    0,
  );

  const baseToWithdraw = atoms(
    marketState.getWithdrawableBalanceAtoms(maker.publicKey, true),
  );
  const quoteToWithdraw = atoms(
    marketState.getWithdrawableBalanceAtoms(maker.publicKey, false),
  );
  signatures.withdraw = await send(
    connection,
    new Transaction().add(
      amountInstruction({
        discriminator: 3,
        amountAtoms: baseToWithdraw,
        owner: maker.publicKey,
        market: market.publicKey,
        mint: baseMint,
        traderToken: makerBase,
      }),
      amountInstruction({
        discriminator: 3,
        amountAtoms: quoteToWithdraw,
        owner: maker.publicKey,
        market: market.publicKey,
        mint: quoteMint,
        traderToken: makerQuote,
      }),
    ),
    [payer, maker],
  );

  marketState = await Market.loadFromAddress({
    connection,
    address: market.publicKey,
  });
  assert.equal(
    atoms(marketState.getWithdrawableBalanceAtoms(maker.publicKey, true)),
    0n,
  );
  assert.equal(
    atoms(marketState.getWithdrawableBalanceAtoms(maker.publicKey, false)),
    0n,
  );

  const [makerBaseFinal, makerQuoteFinal, takerBaseFinal, takerQuoteFinal] =
    await Promise.all([
      getAccount(connection, makerBase),
      getAccount(connection, makerQuote),
      getAccount(connection, takerBase),
      getAccount(connection, takerQuote),
    ]);

  const evidence: Evidence = {
    schema: 'makerbook.devnet-smoke.v1',
    generatedAt: new Date().toISOString(),
    rpcEndpoint,
    programId: PROGRAM_ID.toBase58(),
    payer: payer.publicKey.toBase58(),
    authorizedMaker: maker.publicKey.toBase58(),
    unauthorizedMaker: unauthorized.publicKey.toBase58(),
    publicTaker: taker.publicKey.toBase58(),
    market: market.publicKey.toBase58(),
    baseMint: baseMint.toBase58(),
    quoteMint: quoteMint.toBase58(),
    signatures,
    assertions: {
      programExecutable: true,
      unauthorizedClaimRejected: true,
      unauthorizedSeatAbsent: true,
      authorizedClaimSucceeded: true,
      authorizedSeatPresent: true,
      directDepositSucceeded: true,
      directBatchPlaceSucceeded: true,
      publicSwapSucceeded: true,
      publicSwapV2Succeeded: true,
      publicTakerSeatRemoved: true,
      directBatchCancelSucceeded: true,
      directWithdrawSucceeded: true,
    },
    final: {
      makerBaseWalletAtoms: makerBaseFinal.amount.toString(),
      makerQuoteWalletAtoms: makerQuoteFinal.amount.toString(),
      takerBaseWalletAtoms: takerBaseFinal.amount.toString(),
      takerQuoteWalletAtoms: takerQuoteFinal.amount.toString(),
      openOrderCount: marketState.openOrders().length,
    },
  };

  const outputPath = process.env.MAKERBOOK_SMOKE_OUTPUT;
  if (outputPath) {
    fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, {
      mode: 0o600,
    });
    fs.chmodSync(outputPath, 0o600);
  }
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

main().catch(async (error: unknown) => {
  if (error instanceof SendTransactionError) {
    process.stderr.write(`${error.message}\n`);
  } else {
    process.stderr.write(`${String(error)}\n`);
  }
  process.exitCode = 1;
});
