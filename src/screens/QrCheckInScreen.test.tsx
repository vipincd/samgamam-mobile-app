import React from "react";
import { StyleSheet } from "react-native";
import { act, create } from "react-test-renderer";
import { CameraView } from "expo-camera";
import { QrCheckInScreen } from "./QrCheckInScreen";

it("fills the camera viewport with the scanner and centers the complete overlay", async () => {
  expect(Reflect.get(StyleSheet, "absoluteFillObject")).toBeUndefined();

  let tree: ReturnType<typeof create>;
  await act(async () => {
    tree = create(
      <QrCheckInScreen
        eventId="event-1"
        eventTitle="Event"
        locale="en"
        onBack={jest.fn()}
      />,
    );
  });

  const fillLayout = {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  };
  const camera = tree!.root.findByType(CameraView);
  expect(StyleSheet.flatten(camera.props.style)).toEqual(fillLayout);

  const overlayLabel = tree!.root.findByProps({
    children: "Align ticket QR code within frame",
  });
  expect(
    StyleSheet.flatten(overlayLabel.parent?.props.style),
  ).toEqual({
    ...fillLayout,
    alignItems: "center",
    justifyContent: "center",
  });

  await act(async () => tree!.unmount());
});
