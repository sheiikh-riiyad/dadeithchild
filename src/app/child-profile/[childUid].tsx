import { getAuth, onAuthStateChanged } from '@react-native-firebase/auth';
import { doc, getDoc, getFirestore } from '@react-native-firebase/firestore';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const auth = getAuth();
const firestore = getFirestore();
const colors = { background: '#F5F7F5', ink: '#182B27', muted: '#75847F', green: '#237A62', paleGreen: '#E7F2ED', border: '#E2E9E5', white: '#FFFFFF' };

type ChildProfile = {
  uid: string;
  name: string;
  deviceName: string;
  status: string;
  parentUid: string;
  parentName: string;
  connectedAt?: unknown;
};

function getString(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function formatDate(value: unknown) {
  if (
    typeof value === 'object'
    && value !== null
    && 'toDate' in value
    && typeof value.toDate === 'function'
  ) {
    return value.toDate().toLocaleString();
  }
  return 'Not available';
}

export default function ChildProfileScreen() {
  const { childUid: routeChildUid } = useLocalSearchParams<{ childUid: string }>();
  const childUid = Array.isArray(routeChildUid) ? routeChildUid[0] : routeChildUid;
  const [profile, setProfile] = useState<ChildProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.replace('/');
        return;
      }
      if (user.isAnonymous) {
        router.replace('/child');
        return;
      }
      if (!childUid) {
        setErrorMessage('This child profile could not be found.');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setErrorMessage(null);
      getDoc(doc(firestore, 'users', user.uid, 'children', childUid))
        .then((snapshot) => {
          if (!active) return;
          if (!snapshot.exists()) {
            setProfile(null);
            setErrorMessage('This child is no longer connected to your family.');
            return;
          }
          const data = snapshot.data();
          if (data.parentUid !== user.uid) {
            setProfile(null);
            setErrorMessage('This child profile is not part of your family.');
            return;
          }
          setProfile({
            uid: snapshot.id,
            name: getString(data.name, 'Child'),
            deviceName: getString(data.deviceName, 'Child device'),
            status: getString(data.status, 'connected'),
            parentUid: user.uid,
            parentName: getString(data.parentName, user.displayName ?? 'Parent'),
            connectedAt: data.connectedAt,
          });
        })
        .catch(() => {
          if (active) setErrorMessage('Could not load this child profile. Check your connection and try again.');
        })
        .finally(() => {
          if (active) setIsLoading(false);
        });
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [childUid]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <Text style={styles.backText}>‹  Family dashboard</Text>
        </Pressable>

        <View style={styles.titleBlock}>
          <Text style={styles.eyebrow}>CHILD PROFILE</Text>
          <Text style={styles.title}>{isLoading ? 'Loading profile…' : profile?.name ?? 'Profile unavailable'}</Text>
          <Text style={styles.subtitle}>Information about this child and their connected device.</Text>
        </View>

        {errorMessage ? (
          <View style={styles.messageCard}>
            <Text accessibilityRole="alert" style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : profile ? (
          <>
            <View style={styles.deviceCard}>
              <View style={styles.deviceIcon}><Text style={styles.deviceIconText}>▯</Text></View>
              <View style={styles.deviceDetails}>
                <Text style={styles.deviceLabel}>CONNECTED DEVICE</Text>
                <Text style={styles.deviceName}>{profile.deviceName}</Text>
                <View style={styles.statusPill}><View style={styles.statusDot} /><Text style={styles.statusText}>{profile.status}</Text></View>
              </View>
            </View>

            <View style={styles.infoCard}>
              <Text style={styles.sectionTitle}>Child information</Text>
              <InfoRow label="Child name" value={profile.name} />
              <InfoRow label="Device name" value={profile.deviceName} />
              <InfoRow label="Connection status" value={profile.status} />
              <InfoRow label="Connected" value={formatDate(profile.connectedAt)} />
            </View>

            <View style={styles.infoCard}>
              <Text style={styles.sectionTitle}>Family connection</Text>
              <InfoRow label="Parent" value={profile.parentName} />
              <InfoRow label="Parent account ID" value={profile.parentUid} />
              <InfoRow label="Child device ID" value={profile.uid} />
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/child-profile-controls/[childUid]', params: { childUid: profile.uid } })}
              style={({ pressed }) => [styles.controlsButton, pressed && styles.pressed]}>
              <Text style={styles.controlsButtonText}>Open child controls</Text>
              <Text style={styles.controlsButtonArrow}>›</Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text selectable style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 12 },
  backText: { color: colors.green, fontSize: 12, fontWeight: '800' },
  titleBlock: { marginTop: 18, marginBottom: 20 },
  eyebrow: { color: colors.green, fontSize: 9, fontWeight: '900', letterSpacing: 1.7 },
  title: { color: colors.ink, fontSize: 28, lineHeight: 34, fontWeight: '900', letterSpacing: -0.8, marginTop: 6 },
  subtitle: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  deviceCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 17, borderRadius: 18, backgroundColor: colors.paleGreen, marginBottom: 13 },
  deviceIcon: { width: 48, height: 48, borderRadius: 15, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  deviceIconText: { color: colors.green, fontSize: 24, fontWeight: '800' },
  deviceDetails: { flex: 1 },
  deviceLabel: { color: colors.green, fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  deviceName: { color: colors.ink, fontSize: 15, fontWeight: '900', marginTop: 4 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10, backgroundColor: colors.white, marginTop: 7 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#4F9A6C' },
  statusText: { color: colors.green, fontSize: 9, fontWeight: '800', textTransform: 'capitalize' },
  infoCard: { padding: 16, borderRadius: 17, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, marginTop: 10 },
  sectionTitle: { color: colors.ink, fontSize: 13, fontWeight: '900', marginBottom: 5 },
  infoRow: { paddingVertical: 11, borderTopWidth: 1, borderTopColor: '#EFF2F0' },
  infoLabel: { color: colors.muted, fontSize: 9, fontWeight: '700' },
  infoValue: { color: colors.ink, fontSize: 11, lineHeight: 16, marginTop: 4 },
  messageCard: { padding: 16, borderRadius: 15, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  errorText: { color: '#B54747', fontSize: 12, lineHeight: 18 },
  controlsButton: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 16, borderRadius: 13, backgroundColor: colors.green, marginTop: 16 },
  controlsButtonText: { color: colors.white, fontSize: 12, fontWeight: '900' },
  controlsButtonArrow: { color: colors.white, fontSize: 19, marginTop: -2 },
  pressed: { opacity: 0.72 },
});
