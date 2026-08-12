import { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import type { Palette } from '../lib/theme';
import { StyleSheet, View } from 'react-native';
import { useTablet } from '../hooks/useTablet';

interface SplitLayoutProps {
  masterSlot: React.ReactNode;
  detailSlot: React.ReactNode | null;
  placeholder?: React.ReactNode;
}

export function SplitLayout({ masterSlot, detailSlot, placeholder }: SplitLayoutProps) {
  const { colors: c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const { largeTablet } = useTablet();
  const leftWidth = largeTablet ? 400 : 360;

  return (
    <View style={s.root}>
      <View style={[s.master, { width: leftWidth }]}>
        {masterSlot}
      </View>
      <View style={s.divider} />
      <View style={s.detail}>
        {detailSlot ?? placeholder ?? null}
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: c.background,
  },
  master: {
    flexShrink: 0,
  },
  divider: {
    width: 1,
    backgroundColor: c.borderLight,
  },
  detail: {
    flex: 1,
  },
});
