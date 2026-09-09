jest.mock('react-native-auth0', () => {
  class AuthError extends Error {
    constructor(name = 'AuthError', message = '', options = {}) {
      super(message);
      this.name = name;
      this.code = options.code;
    }
  }

  class CredentialsManagerError extends AuthError {}

  class WebAuthError extends AuthError {
    constructor(error = new AuthError()) {
      super(error.name, error.message, { code: error.code });
      this.type = error.type ?? 'UNKNOWN_ERROR';
    }
  }

  return {
    __esModule: true,
    AuthError,
    CredentialsManagerError,
    default: jest.fn(),
    WebAuthError,
    WebAuthErrorCodes: { USER_CANCELLED: 'USER_CANCELLED' },
  };
});
