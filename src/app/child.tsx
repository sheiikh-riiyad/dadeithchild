import { getAuth, onAuthStateChanged } from '@react-native-firebase/auth';
import { doc, getFirestore, onSnapshot } from '@react-native-firebase/firestore';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { signOutChild, syncInstalledApps } from '@/lib/family';

const auth = getAuth();
const firestore = getFirestore();
const colors = { background: '#F5F7F5', ink: '#182B27', muted: '#75847F', green: '#237A62', paleGreen: '#E7F2ED', white: '#FFFFFF', amber: '#9B6B19', paleAmber: '#FFF5DF' };

type ChildProfile = { name?: string; parentName?: string; deviceName?: string; parentUid?: string; appInventoryConsent?: boolean };

export default function ChildDashboard() {
  const [profile, setProfile] = useState<ChildProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSharingApps, setIsSharingApps] = useState(false);
  const hasSyncedApps = useRef(false);

  useEffect(() => {
    let active = true;
    hasSyncedApps.current = false;
    let stopProfile: (() => void) | undefined;
    const stopAuth = onAuthStateChanged(auth, (user) => {
      stopProfile?.();
      stopProfile = undefined;
      if (!user || !user.isAnonymous) {
        router.replace('/');
        setIsLoading(false);
        return;
      }
      stopProfile = onSnapshot(doc(firestore, 'childProfiles', user.uid), (snapshot) => {
        if (!snapshot.exists()) {
          setProfile(null);
          router.replace('/');
        } else {
          const childProfile = snapshot.data() as ChildProfile;
          setProfile(childProfile);
          if (!hasSyncedApps.current && childProfile.parentUid && childProfile.appInventoryConsent) {
            hasSyncedApps.current = true;
            syncInstalledApps(childProfile.parentUid).catch(() => {
              if (active) Alert.alert('App names not updated', 'Could not sync this Android device’s app names. Check your connection and try again.');
            });
          }
        }
        setIsLoading(false);
      }, () => {
        Alert.alert('Could not load your family', 'Check your connection and try again.');
        setIsLoading(false);
      });
    });
    return () => { active = false; stopAuth(); stopProfile?.(); };
  }, []);

  const handleShareAppNames = async () => {
    if (!profile?.parentUid || isSharingApps) return;
    setIsSharingApps(true);
    hasSyncedApps.current = true;
    try {
      await syncInstalledApps(profile.parentUid, true);
      setProfile((current) => current ? { ...current, appInventoryConsent: true } : current);
    } catch {
      hasSyncedApps.current = false;
      Alert.alert('App names not shared', 'Could not sync app names. Check your connection and try again.');
    } finally {
      setIsSharingApps(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutChild();
      router.replace('/');
    } catch {
      Alert.alert('Could not sign out', 'Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>N</Text></View>
          <View><Text style={styles.brandName}>nestguard</Text><Text style={styles.brandCaption}>CHILD DEVICE</Text></View>
        </View>
        <View style={styles.card}>
          <View style={styles.checkCircle}><Text style={styles.check}>✓</Text></View>
          <Text style={styles.eyebrow}>CONNECTED</Text>
          <Text style={styles.title}>{isLoading ? 'Opening your space…' : `Hi, ${profile?.name ?? 'there'}!`}</Text>
          <Text style={styles.body}>
            {profile ? `${profile.deviceName ?? 'This device'} is connected to ${profile.parentName ?? 'your parent'}’s family.` : 'Your family connection is being checked.'}
          </Text>
          <View style={styles.statusRow}><View style={styles.statusDot} /><Text style={styles.statusText}>Connected to your family</Text></View>
          {Platform.OS === 'android' ? (
            profile?.appInventoryConsent ? (
              <Text style={styles.privacyNote}>App names, icons, and identifiers for launcher apps are shared with your parent. App usage history is not collected.</Text>
            ) : profile ? (
              <View style={styles.privacyCard}>
                <Text style={styles.privacyTitle}>Choose whether to share app names</Text>
                <Text style={styles.privacyBody}>Names, icons, and identifiers for apps with a launcher icon will be shared with your parent for app time-limit settings. App usage history is not collected.</Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={isSharingApps}
                  onPress={() => { void handleShareAppNames(); }}
                  style={({ pressed }) => [styles.shareButton, pressed && styles.pressed, isSharingApps && styles.disabled]}>
                  {isSharingApps ? <ActivityIndicator color={colors.white} /> : null}
                  <Text style={styles.shareButtonText}>{isSharingApps ? 'Sharing app names…' : 'Share app names'}</Text>
                </Pressable>
              </View>
            ) : null
          ) : (
            <Text style={styles.privacyNote}>Installed-app names are available only on Android.</Text>
          )}
        </View>
        <Pressable accessibilityRole="button" onPress={handleSignOut} style={({ pressed }) => [styles.signOutButton, pressed && styles.pressed]}>
          <Text style={styles.signOutText}>Sign out of this device</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: 22, paddingTop: 12, justifyContent: 'space-between', paddingBottom: 25 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 36, height: 36, borderRadius: 13, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: colors.white, fontSize: 17, fontWeight: '900' },
  brandName: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  brandCaption: { color: colors.muted, fontSize: 8, letterSpacing: 1.5, fontWeight: '800', marginTop: 3 },
  card: { alignItems: 'center', padding: 24, borderRadius: 22, backgroundColor: colors.white, borderWidth: 1, borderColor: '#E7EEEA' },
  checkCircle: { width: 60, height: 60, borderRadius: 21, backgroundColor: colors.paleGreen, alignItems: 'center', justifyContent: 'center', marginBottom: 17 },
  check: { color: colors.green, fontSize: 32, fontWeight: '700' },
  eyebrow: { color: colors.green, fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: colors.ink, fontSize: 26, fontWeight: '900', textAlign: 'center', marginTop: 8 },
  body: { color: colors.muted, fontSize: 12, lineHeight: 19, textAlign: 'center', marginTop: 9 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14, backgroundColor: '#EFF6F1', marginTop: 20 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4D9A6A' },
  statusText: { color: '#39734E', fontSize: 10, fontWeight: '800' },
  privacyCard: { width: '100%', padding: 14, marginTop: 16, borderRadius: 13, backgroundColor: colors.paleAmber },
  privacyTitle: { color: colors.amber, fontSize: 11, fontWeight: '900' },
  privacyBody: { color: '#80652F', fontSize: 10, lineHeight: 15, marginTop: 5 },
  shareButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12, marginTop: 11, borderRadius: 10, backgroundColor: colors.green },
  shareButtonText: { color: colors.white, fontSize: 11, fontWeight: '800' },
  disabled: { opacity: 0.7 },
  privacyNote: { color: colors.muted, fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 16 },
  signOutButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  signOutText: { color: colors.muted, fontSize: 11, fontWeight: '800' },
  pressed: { opacity: 0.7 },
});
