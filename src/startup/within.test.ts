import { within } from './within';

describe('startup timing bounds', () => {
  it('returns a completed operation', async () => {
    await expect(within(Promise.resolve('ready'), 10)).resolves.toBe('ready');
  });

  it('returns a recovery-safe message when an operation takes too long', async () => {
    await expect(within(new Promise<never>(() => undefined), 1)).rejects.toThrow(
      'The connection is taking longer than expected. Please try again.',
    );
  });
});
