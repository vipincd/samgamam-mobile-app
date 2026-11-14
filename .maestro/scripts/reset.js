// MOCK_RUN_ID is injected by scripts/testing/run-maestro.mjs (maestro -e). The
// mock answers control requests only for the run that owns it, so a flow can
// never switch the scenario of another platform's mock on port 4318.
var runId = typeof MOCK_RUN_ID !== 'undefined' ? MOCK_RUN_ID : '';
var response = http.post('http://127.0.0.1:4318/__mock/reset?mode=' + MODE, {
  body: '{}',
  headers: { 'x-mock-run-id': runId },
});
if (response.status !== 200) throw new Error('Mock reset failed: ' + response.status + ' ' + response.body);
