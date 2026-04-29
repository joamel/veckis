import { useAuth, useUser } from '@clerk/clerk-expo';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function SettingsScreen() {
  const { signOut } = useAuth();
  const { user } = useUser();

  return (
    <View style={styles.container}>
      <Text style={styles.name}>{user?.fullName ?? user?.emailAddresses[0]?.emailAddress}</Text>
      <Pressable style={styles.button} onPress={() => signOut()}>
        <Text style={styles.buttonText}>Logga ut</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  name: { fontSize: 18, fontWeight: '600', textAlign: 'center', marginBottom: 32 },
  button: {
    backgroundColor: '#ef4444',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
