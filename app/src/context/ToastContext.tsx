import { createContext, useContext, useRef, useState, useCallback, ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { getApiErrorMessage } from '../api/client';

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
      Animated.delay(a ? 5000 : v === 'error' ? 3500 : 2500),
      Animated.timing(opacity, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start(() => setAction(null));
  }, [opacity]);

  const showError = useCallback((err: unknown, fallback: string) => {
    showToast(getApiErrorMessage(err, fallback), 'error');
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, showError }}>
      {children}
      <Animated.View
        style={[s.toast, variant === 'neutral' && s.toastNeutral, variant === 'error' && s.toastError, { opacity }]}
        pointerEvents={action ? 'auto' : 'none'}
      >
        <Text style={[s.toastText, action ? { flex: 1 } : null]}>{message}</Text>
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
    bottom: 96,
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
  toastNeutral: { backgroundColor: '#374151' },
  toastError: { backgroundColor: '#dc2626' },
  toastText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  actionBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.2)' },
  actionText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});
