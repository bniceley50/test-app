import { View, Text, StyleSheet } from 'react-native';

export default function CodeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Code Reference</Text>
      <Text style={styles.sub}>Coming soon — browse KY plumbing code sections.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#16213e',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  sub: {
    color: '#999',
    fontSize: 14,
    textAlign: 'center',
  },
});
