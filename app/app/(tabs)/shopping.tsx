import { Text, View, StyleSheet } from 'react-native';

export default function ShoppingScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Inköpslistor</Text>
      <Text style={styles.sub}>Kommer snart...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  text: { fontSize: 24, fontWeight: '600' },
  sub: { color: '#999', marginTop: 8 },
});
