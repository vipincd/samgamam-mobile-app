import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import { DiscoverScreen } from './DiscoverScreen';
import { apiClient } from '../api/client';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

it('caps Dynamic Type scaling of the Discover hero headline so it cannot fill the screen at AX sizes', async () => {
  jest.spyOn(apiClient, 'getEvents').mockResolvedValue({ events: [], nextCursor: null } as never);
  let tree: ReturnType<typeof create>;
  await act(async () => {
    tree = create(
      <DiscoverScreen
        authenticated={false}
        isFocused
        locale="en"
        onClearTargetEventId={jest.fn()}
        onRequestSignIn={jest.fn()}
        targetEventId={null}
        viewerName={null}
      />,
    );
  });
  const heading = tree!.root.findAll(
    (node) => node.type === Text && node.props.accessibilityRole === 'header' && String(node.props.children).includes('Find your next'),
  )[0];
  expect(heading).toBeDefined();
  // Still scales for readability, but bounded (33pt × 1.6 ≈ 53pt at the largest setting).
  expect(heading.props.maxFontSizeMultiplier).toBe(1.6);
  await act(async () => tree!.unmount());
});
