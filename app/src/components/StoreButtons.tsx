import { Linking, StyleSheet, Text, View } from 'react-native';
import { Pressable } from './Pressable';
import { Ionicons } from '@expo/vector-icons';
import { nyLjus as ny, nyFont } from '../lib/nyDesign';
import { APP_STORE_URL, PLAY_STORE_URL } from '../lib/storeLinks';
import { storeButtons as str } from '../lib/svenska';

type Store = 'ios' | 'android';

/**
 * Länkar till App Store och Google Play på webbens publika sidor. Fast
 * varumärkespalett, som sidorna de sitter på. `tone` efter bakgrunden:
 * 'dark' = kontur på skog (landningssidans topp), 'light' = fylld skog på
 * ljust kort (installationssidan). `only` visar en enda butik.
 */
export function StoreButtons({ tone, only }: { tone: 'dark' | 'light'; only?: Store }) {
  const stores: Store[] = only ? [only] : ['ios', 'android'];
  return (
    <View style={s.row}>
      {stores.map(store => {
        const ios = store === 'ios';
        return (
          <Pressable
            key={store}
            style={[s.btn, tone === 'dark' ? s.btnDark : s.btnLight]}
            onPress={() => { void Linking.openURL(ios ? APP_STORE_URL : PLAY_STORE_URL); }}
            accessibilityRole="link"
            accessibilityLabel={ios ? str.appStoreA11y : str.googlePlayA11y}
          >
            <Ionicons name={ios ? 'logo-apple' : 'logo-google-playstore'} size={22} color={ny.rubrikLjus} />
            <View>
              <Text style={s.small}>{ios ? str.appStoreLead : str.googlePlayLead}</Text>
              <Text style={s.big}>{ios ? str.appStore : str.googlePlay}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, minWidth: 160 },
  btnDark: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)' },
  btnLight: { backgroundColor: ny.skog },
  small: { fontSize: 11, color: ny.underrubrik },
  big: { fontFamily: nyFont.halvfet, fontSize: 16, color: ny.rubrikLjus },
});
