// Verifies that the mock on loopback port 4318 is a Samgamam acceptance mock and,
// when the run was started by scripts/testing/mock-manager.cjs (which exports
// MOCK_RUN_ID), that it is the mock this run owns rather than another worktree's.
export const MOCK_SERVICE = 'samgamam-acceptance-mock';

export function assertOwnedMock(health, expectedRunId) {
  if (!health || health.service !== MOCK_SERVICE) {
    throw new Error('Expected Samgamam mock on loopback port 4318');
  }
  if (expectedRunId && health.runId !== expectedRunId) {
    throw new Error(
      `[MOCK OWNERSHIP] Mock on port 4318 belongs to runId ${health.runId ?? 'unknown'}, not ${expectedRunId}. Refusing to run flows against another run's mock.`,
    );
  }
  return health;
}
