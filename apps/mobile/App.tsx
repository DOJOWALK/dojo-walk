import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <View style={styles.mark}>
        <Text style={styles.markText}>DW</Text>
      </View>
      <Text style={styles.title}>DOJO WALK</Text>
      <Text style={styles.tagline}>WALK. CARE. TRUST.</Text>
      <Text style={styles.description}>
        Trusted dog walks, with care you can follow.
      </Text>
      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>Your dog’s daily walk starts here.</Text>
        <Text style={styles.noticeBody}>
          Customer and walker sign-in, bookings, live walk tracking, and reports
          will be added in the next development steps.
        </Text>
      </View>
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  mark: {
    width: 76,
    height: 76,
    borderRadius: 22,
    backgroundColor: '#F07824',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  markText: { color: '#FFFFFF', fontSize: 28, fontWeight: '800' },
  title: { color: '#242424', fontSize: 29, fontWeight: '800', letterSpacing: 1.2 },
  tagline: { color: '#F07824', fontSize: 12, fontWeight: '800', letterSpacing: 2, marginTop: 8 },
  description: { color: '#666666', fontSize: 15, marginTop: 18, textAlign: 'center' },
  notice: {
    width: '100%',
    backgroundColor: '#FFF4EB',
    borderRadius: 16,
    padding: 18,
    marginTop: 34,
  },
  noticeTitle: { color: '#242424', fontSize: 16, fontWeight: '700' },
  noticeBody: { color: '#5E5149', fontSize: 13, lineHeight: 20, marginTop: 8 },
});
