import { getAuth, onAuthStateChanged } from '@react-native-firebase/auth';
import { doc, getFirestore, onSnapshot } from '@react-native-firebase/firestore';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { syncInstalledApps } from '@/lib/family';

const auth = getAuth();
const firestore = getFirestore();

const colors = {
  background: '#F5F7F5',
  ink: '#182B27',
  muted: '#75847F',
  green: '#237A62',
  paleGreen: '#E7F2ED',
  border: '#E2E9E5',
  white: '#FFFFFF',
  amber: '#9B6B19',
  paleAmber: '#FFF5DF',
};

type ChildProfile = {
  parentUid?: string;
  appInventoryConsent?: boolean;
};

type PermissionInfo = {
  icon: string;
  title: string;
  description: string;
};

const unavailablePermissions: PermissionInfo[] = [
  {
    icon: '◉',
    title: 'Microphone',
    description: 'Nestguard does not record or stream audio.',
  },
  {
    icon: '♫',
    title: 'Speaker audio',
    description: 'There is no permission to listen to speaker output; Nestguard does not capture it.',
  },
  {
    icon: '▣',
    title: 'Screen sharing',
    description: 'Screen capture is not connected. No screenshots or recordings are taken.',
  },
  {
    icon: '▤',
    title: 'Notification contents',
    description: 'Reading other apps’ notifications is not connected.',
  },
  {
    icon: '◷',
    title: 'App usage time',
    description: 'Usage history is not measured or shared.',
  },
  {
    icon: '⌖',
    title: 'Background location',
    description: 'Background location access is not requested. Sharing is optional, child-controlled, and stops when Nestguard is in the background.',
  },
  {
    icon: '✉',
    title: 'Read SMS messages',
    description: 'Nestguard does not read or share your text messages.',
  },
  {
    icon: '➤',
    title: 'Send SMS messages',
    description: 'Nestguard does not send text messages from your device.',
  },
  {
    icon: '♙',
    title: 'Contacts & calls',
    description: 'Your contacts and call history are not accessed.',
  },
];

export default function ChildPermissionsScreen() {
  const [profile, setProfile] = useState<ChildProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSharingApps, setIsSharingApps] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
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
          return;
        }

        setProfile(snapshot.data() as ChildProfile);
        setIsLoading(false);
      }, () => {
        if (!active) return;
        setErrorMessage('Could not load your permission settings. Check your connection and try again.');
        setIsLoading(false);
      });
    });

    return () => {
      active = false;
      stopAuth();
      stopProfile?.();
    };
  }, []);

  const shareAppNames = async () => {
    if (!profile?.parentUid || isSharingApps || Platform.OS !== 'android') return;

    setIsSharingApps(true);
    setErrorMessage(null);
    try {
      await syncInstalledApps(profile.parentUid, true);
    } catch {
      setErrorMessage('Could not share app names. Check your connection and try again.');
    } finally {
      setIsSharingApps(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <Text style={styles.backText}>‹  Back to child portal</Text>
        </Pressable>

        <View style={styles.titleBlock}>
          <Text style={styles.eyebrow}>YOUR PRIVACY</Text>
          <Text style={styles.title}>Privacy & permissions</Text>
          <Text style={styles.subtitle}>See what this app can access. Nothing here secretly turns on your camera, microphone, or screen.</Text>
        </View>

        {errorMessage ? (
          <View style={styles.errorCard}>
            <Text accessibilityRole="alert" style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <View style={styles.summaryCard}>
          <View style={styles.summaryIcon}><Text style={styles.summaryIconText}>✓</Text></View>
          <View style={styles.summaryCopy}>
            <Text style={styles.summaryTitle}>You’re in control</Text>
            <Text style={styles.summaryDescription}>Camera, microphone, screen, and messages are not enabled. Foreground location is optional and child-controlled.</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>App list sharing</Text>
        <View style={styles.permissionCard}>
          <PermissionHeading icon="▦" title="Installed app names" status={profile?.appInventoryConsent ? 'Shared' : 'Optional'} enabled={profile?.appInventoryConsent === true} />
          <Text style={styles.permissionDescription}>
            {Platform.OS === 'android'
              ? 'On Android, the names, icons, and identifiers of apps with a launcher icon can be shared with your parent. This does not include app usage time.'
              : 'Installed app names are available only on Android.'}
          </Text>
          {Platform.OS === 'android' && !isLoading && !profile?.appInventoryConsent ? (
            <Pressable
              accessibilityRole="button"
              disabled={isSharingApps}
              onPress={() => { void shareAppNames(); }}
              style={({ pressed }) => [styles.shareButton, pressed && styles.pressed, isSharingApps && styles.disabled]}>
              {isSharingApps ? <ActivityIndicator color={colors.white} /> : null}
              <Text style={styles.shareButtonText}>{isSharingApps ? 'Sharing app names…' : 'Choose to share app names'}</Text>
            </Pressable>
          ) : null}
        </View>

        <Text style={styles.sectionTitle}>Foreground location</Text>
        <View style={styles.permissionCard}>
          <PermissionHeading icon="⌖" title="Share latest location" status="Optional" enabled={false} />
          <Text style={styles.permissionDescription}>You can start or stop sharing from the child portal. Your parent can see the latest location while sharing is on. Access is requested only when you choose to share, and sharing stops when Nestguard leaves the foreground. Turning it off deletes the shared location; if the device is offline, the last point can remain visible for up to one minute before it is marked stale.</Text>
        </View>

        <Text style={styles.sectionTitle}>Not connected</Text>
        <Text style={styles.sectionDescription}>These features are not available in Nestguard, so there is nothing to grant right now.</Text>
        <View style={styles.permissionList}>
          {unavailablePermissions.map((permission) => (
            <PermissionRow key={permission.title} permission={permission} />
          ))}
        </View>

        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>A quick note</Text>
          <Text style={styles.noteDescription}>Notification permission normally lets an app send you notifications. It does not let an app read notifications from other apps. This app does not request that access.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function PermissionHeading({ icon, title, status, enabled }: { icon: string; title: string; status: string; enabled: boolean }) {
  return (
    <View style={styles.permissionHeading}>
      <View style={styles.permissionIcon}><Text style={styles.permissionIconText}>{icon}</Text></View>
      <Text style={styles.permissionTitle}>{title}</Text>
      <Text style={[styles.statusBadge, enabled && styles.statusBadgeEnabled]}>{status}</Text>
    </View>
  );
}

function PermissionRow({ permission }: { permission: PermissionInfo }) {
  return (
    <View style={styles.permissionRow}>
      <PermissionHeading icon={permission.icon} title={permission.title} status="Not connected" enabled={false} />
      <Text style={styles.permissionDescription}>{permission.description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 30 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 12 },
  backText: { color: colors.green, fontSize: 12, fontWeight: '800' },
  titleBlock: { marginTop: 18, marginBottom: 18 },
  eyebrow: { color: colors.green, fontSize: 9, fontWeight: '900', letterSpacing: 1.7 },
  title: { color: colors.ink, fontSize: 27, lineHeight: 33, fontWeight: '900', letterSpacing: -0.8, marginTop: 6 },
  subtitle: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 6 },
  summaryCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 15, marginBottom: 22, borderRadius: 16, backgroundColor: colors.paleGreen, borderWidth: 1, borderColor: '#CDE3D7' },
  summaryIcon: { width: 30, height: 30, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  summaryIconText: { color: colors.green, fontSize: 17, fontWeight: '900' },
  summaryCopy: { flex: 1 },
  summaryTitle: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  summaryDescription: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 4 },
  sectionTitle: { color: colors.ink, fontSize: 14, fontWeight: '900', marginBottom: 6 },
  sectionDescription: { color: colors.muted, fontSize: 10, lineHeight: 15, marginBottom: 11 },
  permissionCard: { padding: 14, marginBottom: 22, borderRadius: 15, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  permissionList: { gap: 8, marginTop: 4 },
  permissionRow: { padding: 13, borderRadius: 14, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  permissionHeading: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  permissionIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0F5F2' },
  permissionIconText: { color: colors.green, fontSize: 15, fontWeight: '800' },
  permissionTitle: { flex: 1, color: colors.ink, fontSize: 11, fontWeight: '800' },
  statusBadge: { overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, color: colors.amber, backgroundColor: colors.paleAmber, fontSize: 8, fontWeight: '900' },
  statusBadgeEnabled: { color: colors.green, backgroundColor: colors.paleGreen },
  permissionDescription: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 9 },
  shareButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12, marginTop: 12, borderRadius: 10, backgroundColor: colors.green },
  shareButtonText: { color: colors.white, fontSize: 10, fontWeight: '800' },
  noteCard: { padding: 14, marginTop: 18, borderRadius: 14, backgroundColor: colors.paleAmber, borderWidth: 1, borderColor: '#F1E2BF' },
  noteTitle: { color: colors.amber, fontSize: 11, fontWeight: '900' },
  noteDescription: { color: '#80652F', fontSize: 10, lineHeight: 15, marginTop: 5 },
  errorCard: { padding: 13, marginBottom: 12, borderRadius: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  errorText: { color: '#B54747', fontSize: 11, lineHeight: 16 },
  disabled: { opacity: 0.7 },
  pressed: { opacity: 0.75 },
});
