import { apiClient, ApiError } from './client';
import { createServer } from 'node:http';

import { createMockServer } from '../../scripts/testing/mock-api.cjs';
let server: ReturnType<typeof createServer>;
let base: string;
const reset = async (mode: string) => {
  await fetch(`${base}/__mock/reset?mode=${mode}`, { method: 'POST' });
  await apiClient.setAccessToken(null);
};

beforeAll(async () => {
  server = createMockServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing mock address');
  base = `http://127.0.0.1:${address.port}`;
  await apiClient.setApiBaseUrl(base);
  apiClient.setTokenExpiredHandler(async () => false);
});
afterAll(async () => {
  await apiClient.clearStoredSession();
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
});

it('uses the real client over HTTP for login, stored session, RSVP consent, cancellation and logout', async () => {
  await reset('success');
  await expect(apiClient.login('qa@example.test', 'wrong')).rejects.toMatchObject({ status: 401 });
  expect(apiClient.hasStoredAccessToken()).toBe(false);
  await apiClient.login('qa@example.test', 'test-only-password');
  expect((await apiClient.getSession()).viewer?.id).toBe('qa-user');
  await expect(apiClient.rsvpToEvent('qa-event')).rejects.toMatchObject({ status: 400, code: 'consent_required' });
  expect((await apiClient.rsvpToEvent('qa-event', 'going', { termsAccepted: true })).event.viewerRsvpState).toBe('going');
  expect((await apiClient.cancelRsvp('qa-event')).event.viewerRsvpState).toBe('cancelled');
  await apiClient.logout();
  expect(apiClient.hasStoredAccessToken()).toBe(false);
  expect((await apiClient.getSession()).authenticated).toBe(false);
});
it('loads and searches real HTTP fixtures and empty groups', async () => {
  await reset('success');
  expect((await apiClient.getEvents()).events[0].id).toBe('qa-event');
  expect((await apiClient.searchEvents('nomatch')).items).toEqual([]);
  await reset('empty');
  expect((await apiClient.getGroups()).groups).toEqual([]);
});
it.each([['error', 503], ['unauthorized', 401], ['forbidden', 403]])('handles %s and recovers', async (mode, status) => {
  await reset(String(mode));
  await expect(apiClient.getEvents()).rejects.toMatchObject({ status });
  await reset('success');
  expect((await apiClient.getEvents()).events).toHaveLength(1);
});
it('rejects malformed JSON without returning fabricated events', async () => {
  await reset('malformed');
  await expect(apiClient.getEvents()).rejects.toMatchObject({ code: 'invalid_json' });
});
it('classifies transport failure and recovers', async () => {
  await reset('offline');
  await expect(apiClient.getEvents()).rejects.toBeInstanceOf(ApiError);
  await reset('success');
  expect((await apiClient.getEvents()).events).toHaveLength(1);
});
it('clears expired credentials', async () => {
  await reset('success');
  await apiClient.login('qa@example.test', 'test-only-password');
  await fetch(`${base}/__mock/reset?mode=unauthorized`, { method: 'POST' });
  expect((await apiClient.getSession()).authenticated).toBe(false);
  expect(apiClient.hasStoredAccessToken()).toBe(false);
});

it('bounds a stalled HTTP response with the production client timeout', async () => {
  await reset('timeout');
  await expect(apiClient.getEvents()).rejects.toMatchObject({ code: 'timeout', status: 0 });
}, 20000);
