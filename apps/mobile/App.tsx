import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { isSupabaseConfigured, supabase } from './lib/supabase';

type Profile = { role: 'customer' | 'walker' | 'admin'; full_name: string | null; phone: string | null };

function normalizeIndianPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return '+91' + digits;
  if (digits.length === 12 && digits.startsWith('91')) return '+' + digits;
  return value.trim();
}

export default function App() {
  const [phoneInput, setPhoneInput] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadProfile(userId: string) {
    if (!supabase) return;
    const { data, error: profileError } = await supabase
      .from('profiles').select('role, full_name, phone').eq('id', userId).maybeSingle();
    if (profileError || !data) {
      await supabase.auth.signOut();
      setProfile(null);
      setError('आपका DOJO WALK profile नहीं मिला। कृपया Admin से account जाँच करवाएँ।');
      return;
    }
    setProfile(data as Profile);
    setPhoneInput('');
    setOtp('');
    setOtpSent(false);
    setError('');
  }

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive && data.session) void loadProfile(data.session.user.id);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      if (session) {
        setTimeout(() => { if (alive) void loadProfile(session.user.id); }, 0);
      } else {
        setProfile(null);
      }
    });
    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function sendOtp() {
    if (!supabase) return;
    const normalized = normalizeIndianPhone(phoneInput);
    if (!/^\+91[6-9]\d{9}$/.test(normalized)) {
      setError('कृपया सही 10 अंकों का Indian mobile number डालें।');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    const { error: otpError } = await supabase.auth.signInWithOtp({ phone: normalized });
    if (otpError) setError('OTP नहीं भेजा जा सका: ' + otpError.message);
    else {
      setPhone(normalized);
      setOtpSent(true);
      setMessage('OTP भेज दिया गया है। SMS में आया 6 अंकों का code डालें।');
    }
    setBusy(false);
  }

  async function verifyOtp() {
    if (!supabase) return;
    if (!/^\d{6}$/.test(otp)) {
      setError('6 अंकों का OTP डालें।');
      return;
    }
    setBusy(true);
    setError('');
    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      phone, token: otp, type: 'sms',
    });
    if (verifyError) setError('OTP verify नहीं हुआ। Code जाँचें या नया OTP मँगाएँ।');
    else if (data.user) await loadProfile(data.user.id);
    setBusy(false);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setProfile(null);
    setMessage('आप सुरक्षित रूप से sign out हो गए हैं।');
  }

  const roleText = profile?.role === 'walker' ? 'Walker account' : profile?.role === 'admin' ? 'Admin account' : 'Customer account';

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.brandMark}><Text style={styles.markText}>DW</Text></View>
        <Text style={styles.title}>DOJO WALK</Text>
        <Text style={styles.tagline}>WALK. CARE. TRUST.</Text>
        <Text style={styles.subtitle}>Trusted dog walks, with care you can follow.</Text>

        {!isSupabaseConfigured && (
          <View style={styles.notice}><Text style={styles.noticeTitle}>App setup pending</Text>
            <Text style={styles.noticeBody}>Supabase Project URL और Publishable Key को apps/mobile/.env में configure करना बाकी है।</Text>
          </View>
        )}

        {profile ? (
          <View style={styles.card}>
            <Text style={styles.cardEyebrow}>SIGNED IN</Text>
            <Text style={styles.welcome}>नमस्ते{profile.full_name ? ', ' + profile.full_name : ''}!</Text>
            <Text style={styles.role}>{roleText}</Text>
            <Text style={styles.body}>आपका account सुरक्षित रूप से connect हो गया है। Booking, walk tracking और reports अगली development stage में जुड़ेंगे।</Text>
            <Pressable style={styles.primaryButton} onPress={() => void signOut()}><Text style={styles.primaryText}>Sign out</Text></Pressable>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardEyebrow}>MOBILE LOGIN</Text>
            <Text style={styles.welcome}>{otpSent ? 'Verify your number' : 'Welcome to DOJO WALK'}</Text>
            <Text style={styles.body}>{otpSent ? phone + ' पर भेजा गया OTP डालें।' : 'Customer और Walker अपने registered mobile number से login करें।'}</Text>
            {!otpSent ? (
              <>
                <Text style={styles.label}>Mobile number</Text>
                <TextInput value={phoneInput} onChangeText={setPhoneInput} placeholder="98765 43210" keyboardType="phone-pad" maxLength={14} style={styles.input} editable={!busy} />
                <Pressable style={[styles.primaryButton, (!isSupabaseConfigured || busy) && styles.disabled]} onPress={() => void sendOtp()} disabled={!isSupabaseConfigured || busy}>
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Send OTP</Text>}
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.label}>6-digit OTP</Text>
                <TextInput value={otp} onChangeText={(value) => setOtp(value.replace(/\D/g, '').slice(0, 6))} placeholder="Enter OTP" keyboardType="number-pad" maxLength={6} style={[styles.input, styles.otpInput]} editable={!busy} />
                <Pressable style={[styles.primaryButton, busy && styles.disabled]} onPress={() => void verifyOtp()} disabled={busy}>
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Verify & continue</Text>}
                </Pressable>
                <Pressable style={styles.textButton} onPress={() => { setOtpSent(false); setOtp(''); setError(''); }}><Text style={styles.textButtonLabel}>Change mobile number</Text></Pressable>
              </>
            )}
            {message ? <Text style={styles.success}>{message}</Text> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Text style={styles.footnote}>आपका OTP किसी के साथ share न करें।</Text>
          </View>
        )}
        <Text style={styles.footer}>DOJO WALK · GAUR CITY · GREATER NOIDA WEST</Text>
        <StatusBar style="dark" />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFF8F2' },
  container: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, paddingTop: 56, paddingBottom: 36 },
  brandMark: { width: 68, height: 68, borderRadius: 20, backgroundColor: '#F07824', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  markText: { color: '#FFFFFF', fontSize: 25, fontWeight: '900' },
  title: { color: '#242424', fontSize: 28, fontWeight: '900', letterSpacing: 1.1 },
  tagline: { color: '#F07824', fontSize: 11, fontWeight: '900', letterSpacing: 2, marginTop: 7 },
  subtitle: { color: '#777', fontSize: 13, textAlign: 'center', marginTop: 16, marginBottom: 24 },
  card: { width: '100%', maxWidth: 440, backgroundColor: '#fff', borderRadius: 20, padding: 22, borderWidth: 1, borderColor: '#F0E7E0' },
  cardEyebrow: { color: '#F07824', fontSize: 10, fontWeight: '900', letterSpacing: 1.7 },
  welcome: { color: '#242424', fontSize: 22, fontWeight: '800', marginTop: 8 },
  body: { color: '#777', fontSize: 13, lineHeight: 20, marginTop: 8 },
  label: { color: '#333', fontSize: 12, fontWeight: '700', marginTop: 22, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#E3DDD8', borderRadius: 11, paddingHorizontal: 14, paddingVertical: 13, color: '#242424', fontSize: 16, backgroundColor: '#fff' },
  otpInput: { letterSpacing: 8, fontWeight: '800', textAlign: 'center', fontSize: 22 },
  primaryButton: { minHeight: 48, borderRadius: 11, backgroundColor: '#F07824', alignItems: 'center', justifyContent: 'center', marginTop: 18, paddingHorizontal: 16 },
  primaryText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  textButton: { alignItems: 'center', padding: 13 },
  textButtonLabel: { color: '#B75A1C', fontSize: 12, fontWeight: '700' },
  notice: { width: '100%', maxWidth: 440, backgroundColor: '#FFF0E4', borderRadius: 12, padding: 14, marginBottom: 16 },
  noticeTitle: { color: '#8E471B', fontWeight: '800', fontSize: 13 },
  noticeBody: { color: '#8E471B', fontSize: 12, lineHeight: 18, marginTop: 5 },
  success: { color: '#237343', fontSize: 12, marginTop: 14, lineHeight: 18 },
  error: { color: '#A52626', fontSize: 12, marginTop: 14, lineHeight: 18 },
  footnote: { color: '#999', fontSize: 10, textAlign: 'center', marginTop: 18 },
  role: { color: '#B75A1C', fontSize: 12, fontWeight: '800', marginTop: 7 },
  footer: { color: '#AAA', fontSize: 9, letterSpacing: 1, marginTop: 28, textAlign: 'center' },
});
