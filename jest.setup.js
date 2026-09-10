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

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Icon = () => React.createElement(View);

  return {
    ArrowRight: Icon,
    ArrowUpRight: Icon,
    Check: Icon,
    Compass: Icon,
    FlaskConical: Icon,
    MapPin: Icon,
    MessageCircle: Icon,
    Search: Icon,
    SearchX: Icon,
    UserRound: Icon,
    UsersRound: Icon,
    WifiOff: Icon,
    X: Icon,
  };
});

jest.mock('expo-splash-screen', () => ({
  hideAsync: jest.fn(async () => undefined),
  preventAutoHideAsync: jest.fn(async () => undefined),
  setOptions: jest.fn(),
}));
