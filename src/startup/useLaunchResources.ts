import { useEffect, useState } from 'react';
import { Asset } from 'expo-asset';
import * as Font from 'expo-font';
import { Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold } from '@expo-google-fonts/manrope';
import { Outfit_600SemiBold } from '@expo-google-fonts/outfit';
import { brand } from '../brand';

export function useLaunchResources() {
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setError(false);
    const timer = setTimeout(() => { if (active) setError(true); }, 12000);
    Promise.all([
      Font.loadAsync({ Manrope_400Regular, Manrope_600SemiBold, Manrope_700Bold, Outfit_600SemiBold }),
      Asset.loadAsync(brand.logo),
    ]).then(() => { if (active) { setReady(true); setError(false); } })
      .catch(() => { if (active) setError(true); })
      .finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); };
  }, [attempt]);
  return { ready, error, retry: () => setAttempt((value) => value + 1) };
}
