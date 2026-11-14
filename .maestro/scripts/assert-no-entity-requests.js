// Fails the flow if the app requested anything other than the Discover listing
// since the last reset: rejected deep links must not reach any API path.
// The mock answers control endpoints only for the run that owns it, so the
// history probe presents this run's id like reset.js does (MOCK_RUN_ID is
// injected by scripts/testing/run-maestro.mjs via `maestro -e`).
var runId = typeof MOCK_RUN_ID !== 'undefined' ? MOCK_RUN_ID : '';
var response = http.get('http://127.0.0.1:4318/__mock/history', {
  headers: { 'x-mock-run-id': runId },
});
if (response.status !== 200) throw new Error('Mock history failed: ' + response.status + ' ' + response.body);
var history = JSON.parse(response.body);
var unexpected = history.filter(function (entry) {
  return !(entry.method === 'GET' && entry.path === '/api/v1/events');
});
if (unexpected.length > 0) throw new Error('Rejected deep link reached the API: ' + JSON.stringify(unexpected));
output.requestCount = history.length;
