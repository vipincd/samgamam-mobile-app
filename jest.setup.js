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

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({
    status: 'granted',
    granted: true,
    canAskAgain: true,
  })),
  requestPermissionsAsync: jest.fn(async () => ({
    status: 'granted',
    granted: true,
    canAskAgain: true,
  })),
  getExpoPushTokenAsync: jest.fn(async () => ({
    data: 'ExponentPushToken[mock-push-token-123456]',
  })),
  setNotificationHandler: jest.fn(),
  addNotificationReceivedListener: jest.fn(() => ({
    remove: jest.fn(),
  })),
  addNotificationResponseReceivedListener: jest.fn(() => ({
    remove: jest.fn(),
  })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
}));

jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    isAvailableAsync: jest.fn(async () => true),
    getItemAsync: jest.fn(async (key) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key, val) => { store.set(key, val); }),
    deleteItemAsync: jest.fn(async (key) => { store.delete(key); }),
    _clear: () => store.clear(),
  };
});

jest.mock("expo-camera", () => {
  const React = require("react");
  const { View } = require("react-native");

  return {
    CameraView: (props) => React.createElement(View, props, props.children),
    useCameraPermissions: jest.fn(() => [
      { granted: true, canAskAgain: true, status: "granted" },
      jest.fn(async () => ({ granted: true, status: "granted" })),
    ]),
  };
});
