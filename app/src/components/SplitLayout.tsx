import { StyleSheet, View } from 'react-native';
import { useTablet } from '../hooks/useTablet';

interface SplitLayoutProps {
  masterSlot: React.ReactNode;
  detailSlot: React.ReactNode | null;
  placeholder?: React.ReactNode;
}

export function SplitLayout({ masterSlot, detailSlot, placeholder }: SplitLayoutProps) {
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

const s = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#faf8f3',
  },
  master: {
    flexShrink: 0,
  },
  divider: {
    width: 1,
    backgroundColor: '#e7e5e4',
  },
  detail: {
    flex: 1,
  },
});
