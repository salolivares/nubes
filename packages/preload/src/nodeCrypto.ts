import { type BinaryLike, createHash } from 'node:crypto';
import { HELLO_WORLD } from '@common';

export function sha256sum(data: BinaryLike) {
  console.log(HELLO_WORLD);
  return createHash('sha256').update(data).digest('hex');
}
