import { createContext, useContext, useRef, useState, useCallback, ReactNode } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';

export type ToastVariant = 'success' | 'neutral';

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
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

  const showToast = useCallback((msg: string, v: ToastVariant = 'success') => {
    setMessage(msg);
    setVariant(v);
    opacity.stopAnimation();
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(opacity, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start();
  }, [opacity]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <Animated.View
        style={[s.toast, variant === 'neutral' && s.toastNeutral, { opacity }]}
        pointerEvents="none"
      >
        <Text style={s.toastText}>{message}</Text>
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
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  toastNeutral: { backgroundColor: '#374151' },
  toastText: { fontSize: 14, fontWeight: '600', color: '#fff' },
});
