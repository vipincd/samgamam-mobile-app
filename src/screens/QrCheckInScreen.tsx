import React, { useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";

import { apiClient, getErrorMessage } from "../api/client";
import type { AttendanceScanResult } from "../api/types";
import {
  Button,
  InlineNotice,
  Pill,
  ScreenIntro,
  Surface,
} from "../components/ui";
import { theme } from "../theme";
import { formatDateTime } from "../utils/format";

export function QrCheckInScreen(props: {
  eventId: string;
  eventTitle: string;
  locale: string;
  onBack: () => void;
  onOpenRoster?: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanningLocked, setScanningLocked] = useState(false);
  const [lastScannedToken, setLastScannedToken] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<AttendanceScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  async function handleBarcodeScanned(scanningResult: { data: string }) {
    if (scanningLocked || isProcessing) return;

    const rawData = scanningResult.data?.trim();
    if (!rawData) return;

    let token = rawData;
    try {
      if (rawData.startsWith("{") && rawData.endsWith("}")) {
        const parsed = JSON.parse(rawData);
        if (parsed.token) {
          token = parsed.token;
        }
      }
    } catch {}

    if (token === lastScannedToken && scanResult) {
      return;
    }

    setScanningLocked(true);
    setIsProcessing(true);
    setError(null);
    setLastScannedToken(token);

    try {
      const result = await apiClient.scanTicket(props.eventId, token);
      setScanResult(result);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsProcessing(false);
    }
  }

  function handleResetScanner() {
    setScanningLocked(false);
    setScanResult(null);
    setError(null);
    setLastScannedToken(null);
  }

  if (!permission) {
    return (
      <View style={styles.container}>
        <View style={styles.headerBar}>
          <Button compact label="Back" onPress={props.onBack} variant="ghost" />
          <Text numberOfLines={1} style={styles.headerTitle}>
            {props.eventTitle}
          </Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centerContent}>
          <ActivityIndicator color={theme.colors.teal} size="large" />
          <Text style={styles.mutedText}>Checking camera permissions...</Text>
        </View>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.headerBar}>
          <Button compact label="Back" onPress={props.onBack} variant="ghost" />
          <Text numberOfLines={1} style={styles.headerTitle}>
            {props.eventTitle}
          </Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.permissionContent}>
          <ScreenIntro
            eyebrow="Camera Access"
            subtitle="Camera permission is required to scan attendee ticket QR codes on entrance."
            title="Scan Tickets On Site"
          />
          <InlineNotice
            message="Camera access is strictly used locally to scan attendee ticket tokens. No video is recorded or stored."
            tone="default"
          />
          <Button
            label="Grant Camera Permission"
            onPress={() => void requestPermission()}
          />
          {props.onOpenRoster ? (
            <Button
              label="Switch to Manual Roster"
              onPress={props.onOpenRoster}
              variant="secondary"
            />
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <Button compact label="Back" onPress={props.onBack} variant="ghost" />
        <Text numberOfLines={1} style={styles.headerTitle}>
          {props.eventTitle}
        </Text>
        {props.onOpenRoster ? (
          <Button compact label="Roster" onPress={props.onOpenRoster} variant="secondary" />
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <View style={styles.cameraContainer}>
        <CameraView
          barcodeScannerSettings={{
            barcodeTypes: ["qr"],
          }}
          onBarcodeScanned={scanningLocked ? undefined : handleBarcodeScanned}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.overlay}>
          <View style={styles.targetFrame} />
          <Text style={styles.overlayText}>
            {scanningLocked ? "Ticket scanned" : "Align ticket QR code within frame"}
          </Text>
        </View>
      </View>

      <View style={styles.resultContainer}>
        {isProcessing ? (
          <Surface style={styles.resultCard}>
            <ActivityIndicator color={theme.colors.teal} />
            <Text style={styles.processingText}>Validating ticket with server...</Text>
          </Surface>
        ) : scanResult ? (
          <Surface
            style={[
              styles.resultCard,
              scanResult.status === "success"
                ? styles.resultSuccess
                : scanResult.status === "already_checked_in"
                ? styles.resultWarning
                : styles.resultInvalid,
            ]}
          >
            <View style={styles.resultHeader}>
              <Text style={styles.resultTitle}>
                {scanResult.status === "success"
                  ? "Check-In Confirmed"
                  : scanResult.status === "already_checked_in"
                  ? "Already Checked In"
                  : "Invalid Ticket"}
              </Text>
              <Pill
                label={
                  scanResult.status === "success"
                    ? "SUCCESS"
                    : scanResult.status === "already_checked_in"
                    ? "ALREADY IN"
                    : "INVALID"
                }
                tone={
                  scanResult.status === "success"
                    ? "success"
                    : scanResult.status === "already_checked_in"
                    ? "accent"
                    : "default"
                }
              />
            </View>

            {scanResult.attendee ? (
              <View style={styles.attendeeInfo}>
                <Text style={styles.attendeeName}>{scanResult.attendee.fullName}</Text>
                <Text style={styles.attendeeMeta}>ID: {scanResult.attendee.userId}</Text>
                <Text style={styles.attendeeMeta}>
                  {formatDateTime(scanResult.attendee.checkedInAt, props.locale)}
                </Text>
              </View>
            ) : scanResult.reason ? (
              <Text style={styles.reasonText}>Reason: {scanResult.reason}</Text>
            ) : null}

            <Button
              label="Scan Next Ticket"
              onPress={handleResetScanner}
              variant="primary"
            />
          </Surface>
        ) : error ? (
          <Surface style={styles.resultCard}>
            <InlineNotice message={error} tone="warning" title="Scan Failed" />
            <Button
              label="Retry Scanner"
              onPress={handleResetScanner}
              variant="secondary"
            />
          </Surface>
        ) : (
          <Surface style={styles.idleCard}>
            <Text style={styles.idleTitle}>Camera Active</Text>
            <Text style={styles.idleSubtitle}>
              Point the camera at the attendee ticket QR code to verify entrance.
            </Text>
          </Surface>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.background,
    flex: 1,
  },
  headerBar: {
    alignItems: "center",
    backgroundColor: theme.colors.card,
    borderBottomColor: theme.colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  centerContent: {
    alignItems: "center",
    flex: 1,
    gap: 12,
    justifyContent: "center",
  },
  permissionContent: {
    flex: 1,
    gap: 16,
    justifyContent: "center",
    padding: 24,
  },
  mutedText: {
    color: theme.colors.muted,
    fontSize: 14,
  },
  cameraContainer: {
    backgroundColor: "#000000",
    flex: 1,
    position: "relative",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  targetFrame: {
    borderColor: theme.colors.teal,
    borderRadius: 16,
    borderWidth: 2,
    height: 220,
    width: 220,
  },
  overlayText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 14,
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  resultContainer: {
    backgroundColor: theme.colors.background,
    padding: 16,
  },
  resultCard: {
    backgroundColor: theme.colors.card,
    gap: 12,
    padding: 16,
  },
  resultSuccess: {
    borderColor: theme.colors.success,
    borderWidth: 1.5,
  },
  resultWarning: {
    borderColor: theme.colors.accent,
    borderWidth: 1.5,
  },
  resultInvalid: {
    borderColor: theme.colors.muted,
    borderWidth: 1.5,
  },
  resultHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  resultTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: "800",
  },
  attendeeInfo: {
    gap: 4,
  },
  attendeeName: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  attendeeMeta: {
    color: theme.colors.muted,
    fontSize: 13,
  },
  reasonText: {
    color: theme.colors.text,
    fontSize: 14,
  },
  processingText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  idleCard: {
    backgroundColor: theme.colors.cardAlt,
    gap: 4,
    padding: 14,
  },
  idleTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  idleSubtitle: {
    color: theme.colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
});
