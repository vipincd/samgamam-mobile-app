var response = http.post('http://127.0.0.1:4318/__mock/reset?mode=' + MODE, { body: '{}' });
if (response.status !== 200) throw new Error('Mock reset failed: ' + response.status);
