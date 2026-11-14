const SERIALIZABLE_ATTEMPTS = 3;

/** Prisma's code for a transaction that failed on a write conflict or deadlock and may be run again. */
function isSerializationConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034';
}

/** Runs `work`, again after a serialization conflict, at most three times; any other error is thrown at once. */
export async function retrySerializable<T>(work: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      if (!isSerializationConflict(error) || attempt === SERIALIZABLE_ATTEMPTS) throw error;
    }
  }
}
