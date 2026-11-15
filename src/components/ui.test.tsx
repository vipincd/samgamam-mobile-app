import React from 'react';
import { TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import { Button, Field } from './ui';

it('gives labeled fields an accessible name and preserves explicit overrides', async () => {
  let tree: ReturnType<typeof create>;
  await act(async () => { tree = create(<Field label="API base URL" value="" />); });
  expect(tree!.root.findByType(TextInput).props.accessibilityLabel).toBe('API base URL');
  await act(async () => { tree!.update(<Field label="URL" accessibilityLabel="Test server address" value="" />); });
  expect(tree!.root.findByType(TextInput).props.accessibilityLabel).toBe('Test server address');
  await act(async () => tree!.unmount());
});
it('exposes action, disabled state and stable identifier to assistive technology', async () => {
  let tree: ReturnType<typeof create>;
  await act(async () => { tree = create(<Button testID="save" label="Save" disabled onPress={jest.fn()} />); });
  const props = tree!.root.findByProps({ testID: 'save', accessibilityRole: 'button' }).props;
  expect(props.accessibilityRole).toBe('button');
  expect(props.accessibilityLabel).toBe('Save');
  expect(props.accessibilityState).toEqual({ disabled: true });
  expect(props.disabled).toBe(true);
  expect(props.testID).toBe('save');
  await act(async () => tree!.unmount());
});
