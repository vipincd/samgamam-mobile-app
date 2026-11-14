// Fails the flow if the app requested anything other than the Discover listing
// since the last reset: rejected deep links must not reach any API path.
var response = http.get('http://127.0.0.1:4318/__mock/history');
if (response.status !== 200) throw new Error('Mock history failed: ' + response.status);
var history = JSON.parse(response.body);
var unexpected = history.filter(function (entry) {
  return !(entry.method === 'GET' && entry.path === '/api/v1/events');
});
if (unexpected.length > 0) throw new Error('Rejected deep link reached the API: ' + JSON.stringify(unexpected));
output.requestCount = history.length;
