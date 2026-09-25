import { createContext, useContext, useRef, useState, useCallback, ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getApiErrorMessage } from '../api/client';
import { useNy } from './ThemeContext';

export type ToastVariant = 'success' | 'neutral' | 'error';

interface ToastAction {
  label: string;
  onPress: () => void;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant, action?: ToastAction) => void;
  /**
   * Show a red error toast for a caught error. Network failures get a
   * connectivity hint; otherwise `fallback` describes what failed. Use this in
   * the catch block after rolling back an optimistic update.
   */
  showError: (err: unknown, fallback: string) => void;
  /**
   * Hur många pixlar längst ned som är upptagna av skärmens egen UI, typiskt
   * en lägg-till-rad. Toasten lägger sig ovanför den.
   *
   * Höjden var tidigare en konstant på 60 px, satt efter en telefon. På
   * modeller där raden är högre lade sig toasten ovanpå sökfältet. Skärmen
   * mäter redan sin rad — nu kan den säga till.
   */
  setBottomObstruction: (px: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const [message, setMessage] = useState('');
  const [variant, setVariant] = useState<ToastVariant>('success');
  const [action, setAction] = useState<ToastAction | null>(null);

  const showToast = useCallback((msg: string, v: ToastVariant = 'success', a?: ToastAction) => {
    setMessage(msg);
    setVariant(v);
    setAction(a ?? null);
    opacity.stopAnimation();
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      // En toast med "Ångra" måste hinna läsas OCH träffas. 5 s räckte inte
      // när man precis råkat radera något och behöver förstå vad som hänt
      // innan man kan agera.
      Animated.delay(a ? 8000 : v === 'error' ? 3500 : 2500),
      Animated.timing(opacity, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start(() => setAction(null));
  }, [opacity]);

  const [obstruction, setObstruction] = useState(0);
  const setBottomObstruction = useCallback((px: number) => {
    setObstruction(prev => (Math.abs(prev - px) > 1 ? px : prev));
  }, []);

  const showError = useCallback((err: unknown, fallback: string) => {
    showToast(getApiErrorMessage(err, fallback), 'error');
  }, [showToast]);

  const ny = useNy();
  const insets = useSafeAreaInsets();
  // 60 som golv för skärmar som inte mäter något; annars skärmens egen höjd.
  const bottomOffset = Math.max(60, obstruction) + insets.bottom + 12;

  return (
    <ToastContext.Provider value={{ showToast, showError, setBottomObstruction }}>
      {children}
      <Animated.View
        style={[
          s.toast,
          // Färgerna kommer ur temat i stället för att vara hårdkodade. Den
          // gamla gröna (#10b981) var kvar från paletten före "skog & lime"
          // och stack ut mot resten av appen. Mörkgrön yta med ljus text är
          // samma språk som header och kort; lime sparas åt knappar man
          // trycker på, så en bekräftelse inte skriker lika högt som en
          // uppmaning.
          { backgroundColor: ny.skogMellan },
          variant === 'error' && { backgroundColor: ny.fara },
          { opacity, bottom: bottomOffset },
        ]}
        pointerEvents={action ? 'auto' : 'none'}
      >
        <Text style={[s.toastText, { color: variant === 'error' ? '#fff' : ny.lime }, action ? { flex: 1 } : null]}>{message}</Text>
        {action && (
          <Pressable
            onPress={() => {
              opacity.stopAnimation();
              opacity.setValue(0);
              const cb = action.onPress;
              setAction(null);
              cb();
            }}
            hitSlop={8}
          >
            <View style={s.actionBtn}>
              <Text style={s.actionText}>{action.label}</Text>
            </View>
          </Pressable>
        )}
      </Animated.View>
    </ToastContext.Provider>
  );
}

const s = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 72,
    left: 24,
    right: 24,
    backgroundColor: '#10b981',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  toastNeutral: { backgroundColor: '#44403c' },
  toastError: { backgroundColor: '#dc2626' },
  toastText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  actionBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.2)' },
  actionText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});
