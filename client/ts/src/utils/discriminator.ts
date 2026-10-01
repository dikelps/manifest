import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import keccak256 from 'keccak256';

// Makerbook retains Manifest's serialized account and event namespace even
// though transactions target Makerbook's distinct program address.
const ABI_NAMESPACE_PROGRAM_ID = new PublicKey(
  'MNFSTqtC93rEfYHB6hF82sKdZpUDFWkViLByLd1k1Ms',
);

export function genAccDiscriminator(accName: string) {
  return keccak256(
    Buffer.concat([
      Buffer.from(bs58.decode(ABI_NAMESPACE_PROGRAM_ID.toBase58())),
      Buffer.from(accName),
    ]),
  ).subarray(0, 8);
}
