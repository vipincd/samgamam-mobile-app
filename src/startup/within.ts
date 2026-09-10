// Bounds presentation waits without changing the client's session/token behavior.
export function within<T>(promise: Promise<T>, milliseconds = 12000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The connection is taking longer than expected. Please try again.')), milliseconds);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
