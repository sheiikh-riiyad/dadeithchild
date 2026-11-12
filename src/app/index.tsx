import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInAnonymously,
  signInWithCredential,
} from '@react-native-firebase/auth';
import { doc, getDoc, getFirestore } from '@react-native-firebase/firestore';
import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { joinFamilyWithCode } from '@/lib/family';

type LoginRole = 'parent' | 'child';

GoogleSignin.configure({
  webClientId: '165711290250-4r4q6l24svkpf0mhohtci3dl96pj453a.apps.googleusercontent.com',
});

const auth = getAuth();
const firestore = getFirestore();
const colors = { background: '#F4F7F5', ink: '#182B27', muted: '#75847F', green: '#237A62', paleGreen: '#E7F2ED', border: '#E2E9E5', white: '#FFFFFF' };

export default function HomeScreen() {
  const [role, setRole] = useState<LoginRole>('parent');
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isJoiningFamily, setIsJoiningFamily] = useState(false);
  const [familyCode, setFamilyCode] = useState('');
  const [childName, setChildName] = useState('');
  const [hasAcceptedAppSharing, setHasAcceptedAppSharing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => onAuthStateChanged(auth, (user) => {
    if (!user) {
      setIsCheckingSession(false);
      return;
    }
    if (!user.isAnonymous) {
      router.replace('/parent');
      return;
    }
    getDoc(doc(firestore, 'childProfiles', user.uid))
      .then((profile) => {
        if (profile.exists()) router.replace('/child');
      })
      .catch(() => setErrorMessage('Could not check this device’s family connection. Please try again.'))
      .finally(() => setIsCheckingSession(false));
  }), []);

  const signInAsParent = async () => {
    setErrorMessage(null);
    setIsSigningIn(true);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response)) return;
      const { idToken } = response.data;
      if (!idToken) throw new Error('Google did not return an ID token. Check the OAuth client configuration.');
      await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not sign in with Google. Please try again.');
    } finally {
      setIsSigningIn(false);
    }
  };

  const joinAsChild = async () => {
    setErrorMessage(null);
    setIsJoiningFamily(true);
    try {
      if (!auth.currentUser) await signInAnonymously(auth);
      await joinFamilyWithCode({ code: familyCode, childName, appInventoryConsent: hasAcceptedAppSharing });
      router.replace('/child');
    } catch (error) {
      const code = (error as { code?: string }).code;
      const message = code === 'auth/operation-not-allowed'
        ? 'Enable Anonymous sign-in in Firebase Console, then try again.'
        : error instanceof Error ? error.message : 'Please check the family code and try again.';
      setErrorMessage(message);
    } finally {
      setIsJoiningFamily(false);
    }
  };

  const isBusy = isCheckingSession || isSigningIn || isJoiningFamily;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}><Text style={styles.brandMarkText}>N</Text></View>
            <View><Text style={styles.brandName}>nestguard</Text><Text style={styles.brandCaption}>FAMILY SAFETY</Text></View>
          </View>

          <View style={styles.hero}>
            <View style={styles.illustration}><View style={styles.orbit} /><View style={styles.shield}><Text style={styles.check}>✓</Text></View></View>
            <Text style={styles.heading}>A little more peace{'\n'}of mind.</Text>
            <Text style={styles.subtitle}>Build safer digital habits together.</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Welcome</Text>
            <Text style={styles.cardSubtitle}>Choose your family role to continue</Text>
            <View style={styles.roleSwitch}>
              <RoleButton label="Parent" icon="⌂" selected={role === 'parent'} onPress={() => { setRole('parent'); setErrorMessage(null); setHasAcceptedAppSharing(false); }} />
              <RoleButton label="Child" icon="♡" selected={role === 'child'} onPress={() => { setRole('child'); setErrorMessage(null); }} />
            </View>

            {role === 'parent' ? (
              <View style={styles.roleContent}>
                <Text style={styles.helperText}>Parents sign in with Google to manage their own family and create a one-time code for each child.</Text>
              </View>
            ) : (
              <View style={styles.roleContent}>
                <Text style={styles.label}>Parent’s family code</Text>
                <TextInput
                  value={familyCode}
                  onChangeText={(value) => setFamilyCode(value.toUpperCase().replace(/[^2-9A-HJ-NP-Z]/g, '').slice(0, 10))}
                  maxLength={10}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  autoComplete="off"
                  placeholder="10-character code"
                  placeholderTextColor="#A3ADA8"
                  style={styles.input}
                />
                <Text style={styles.label}>Child’s name</Text>
                <TextInput
                  value={childName}
                  onChangeText={setChildName}
                  maxLength={40}
                  autoCapitalize="words"
                  autoComplete="name"
                  placeholder="Enter the child’s name"
                  placeholderTextColor="#A3ADA8"
                  style={styles.input}
                  returnKeyType="done"
                />
                <Text style={styles.helperText}>Enter the code once on this device. It will stay connected to your parent’s family.</Text>
                {Platform.OS === 'android' ? (
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: hasAcceptedAppSharing }}
                    onPress={() => setHasAcceptedAppSharing((accepted) => !accepted)}
                    style={styles.consentRow}>
                    <View style={[styles.consentBox, hasAcceptedAppSharing && styles.consentBoxChecked]}>
                      <Text style={styles.consentCheck}>{hasAcceptedAppSharing ? '✓' : ''}</Text>
                    </View>
                    <Text style={styles.consentText}>
                      I understand that app names, icons, and identifiers for apps with a launcher icon on this Android device will be shared with my parent to set app time limits. App usage history is not collected.
                    </Text>
                  </Pressable>
                ) : (
                  <Text style={styles.helperText}>App names are available only on Android. No installed-app information will be shared from this device.</Text>
                )}
              </View>
            )}

            {errorMessage ? <Text accessibilityRole="alert" style={styles.errorText}>{errorMessage}</Text> : null}
            <Pressable
              accessibilityRole="button"
              disabled={isBusy || (role === 'child' && (familyCode.length !== 10 || !childName.trim() || (Platform.OS === 'android' && !hasAcceptedAppSharing)))}
              onPress={role === 'parent' ? signInAsParent : joinAsChild}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, isBusy && styles.disabled]}>
              {isBusy ? <ActivityIndicator color={colors.white} /> : null}
              <Text style={styles.primaryButtonText}>
                {isCheckingSession ? 'Checking this device…' : role === 'parent'
                  ? isSigningIn ? 'Connecting to Google…' : 'Continue with Google'
                  : isJoiningFamily ? 'Joining your family…' : 'Join my family'}
              </Text>
            </Pressable>
            <Text style={styles.footerText}>Your family’s privacy comes first</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function RoleButton({ label, icon, selected, onPress }: { label: string; icon: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected }} onPress={onPress} style={[styles.roleButton, selected && styles.roleButtonSelected]}>
      <Text style={[styles.roleIcon, selected && styles.roleIconSelected]}>{icon}</Text>
      <Text style={[styles.roleText, selected && styles.roleTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, alignItems: 'center', paddingHorizontal: 22, paddingBottom: 24 },
  brandRow: { width: '100%', maxWidth: 480, flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 8 },
  brandMark: { width: 36, height: 36, borderRadius: 13, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: colors.white, fontSize: 17, fontWeight: '900' },
  brandName: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  brandCaption: { color: colors.muted, fontSize: 8, letterSpacing: 1.5, fontWeight: '800', marginTop: 3 },
  hero: { width: '100%', maxWidth: 480, alignItems: 'center', paddingTop: 25, paddingBottom: 22 },
  illustration: { width: 96, height: 85, alignItems: 'center', justifyContent: 'center', marginBottom: 9 },
  orbit: { position: 'absolute', width: 90, height: 68, borderRadius: 45, backgroundColor: '#E5EFEA', transform: [{ rotate: '-16deg' }] },
  shield: { width: 50, height: 57, borderRadius: 21, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  check: { color: colors.white, fontSize: 30, fontWeight: '700' },
  heading: { color: colors.ink, textAlign: 'center', fontSize: 29, lineHeight: 34, fontWeight: '900', letterSpacing: -1 },
  subtitle: { color: colors.muted, textAlign: 'center', fontSize: 13, marginTop: 8 },
  card: { width: '100%', maxWidth: 480, padding: 21, borderRadius: 23, backgroundColor: colors.white, borderWidth: 1, borderColor: '#E8EEEA' },
  cardTitle: { color: colors.ink, fontSize: 20, fontWeight: '900' },
  cardSubtitle: { color: colors.muted, fontSize: 12, marginTop: 4, marginBottom: 16 },
  roleSwitch: { flexDirection: 'row', padding: 4, borderRadius: 13, backgroundColor: '#F3F6F4', marginBottom: 18 },
  roleButton: { flex: 1, height: 42, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  roleButtonSelected: { backgroundColor: colors.white, elevation: 1 },
  roleIcon: { color: '#8B9892', fontSize: 17, fontWeight: '700' },
  roleIconSelected: { color: colors.green },
  roleText: { color: '#7E8B85', fontSize: 13, fontWeight: '600' },
  roleTextSelected: { color: colors.ink, fontWeight: '800' },
  roleContent: { minHeight: 112 },
  label: { color: '#34443E', fontSize: 11, fontWeight: '800', marginBottom: 7 },
  input: { height: 47, borderWidth: 1, borderColor: colors.border, borderRadius: 11, backgroundColor: '#FCFDFC', paddingHorizontal: 13, color: colors.ink, fontSize: 14, marginBottom: 13 },
  helperText: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 15 },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, marginBottom: 12, borderRadius: 12, backgroundColor: '#F3F6F4' },
  consentBox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  consentBoxChecked: { backgroundColor: colors.green, borderColor: colors.green },
  consentCheck: { color: colors.white, fontSize: 14, fontWeight: '900' },
  consentText: { flex: 1, color: colors.ink, fontSize: 10, lineHeight: 15 },
  errorText: { color: '#B54747', fontSize: 12, lineHeight: 17, marginBottom: 12 },
  primaryButton: { minHeight: 50, borderRadius: 12, backgroundColor: colors.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 14 },
  primaryButtonText: { color: colors.white, fontSize: 13, fontWeight: '800' },
  disabled: { opacity: 0.7 },
  pressed: { opacity: 0.82 },
  footerText: { color: colors.muted, fontSize: 10, textAlign: 'center', marginTop: 17 },
});
