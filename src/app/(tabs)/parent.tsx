import { getAuth, onAuthStateChanged, signOut, type User } from '@react-native-firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { collection, doc, getDocs, getFirestore, onSnapshot, query, where, writeBatch } from '@react-native-firebase/firestore';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createFamilyCode } from '@/lib/family';

const auth = getAuth();
const firestore = getFirestore();
const colors = { background: '#F5F7F5', ink: '#182B27', muted: '#75847F', green: '#237A62', paleGreen: '#E7F2ED', border: '#E2E9E5', white: '#FFFFFF' };

type ChildDevice = { id: string; name: string; deviceName: string; status: string };
type FamilyInvite = { code: string; claimed: boolean };

export default function ParentDashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [children, setChildren] = useState<ChildDevice[]>([]);
  const [familyInvites, setFamilyInvites] = useState<FamilyInvite[]>([]);
  const [isCreatingCode, setIsCreatingCode] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => onAuthStateChanged(auth, (activeUser) => {
    if (!activeUser) {
      router.replace('/');
      setIsLoading(false);
      return;
    }
    if (activeUser.isAnonymous) {
      router.replace('/child');
      setIsLoading(false);
      return;
    }
    setUser(activeUser);
    setIsLoading(false);
  }), []);

  useEffect(() => {
    if (!user) return;
    const invitesQuery = query(collection(firestore, 'familyCodes'), where('parentUid', '==', user.uid));
    const stopInvites = onSnapshot(invitesQuery, (snapshot) => {
      setFamilyInvites(snapshot.docs.map((inviteDoc) => ({
        code: inviteDoc.id,
        claimed: Boolean(inviteDoc.data().claimed),
      })).sort((a, b) => a.code.localeCompare(b.code)));
      setLoadError(null);
    }, () => setLoadError('Could not load family codes. Check your connection and Firestore rules.'));
    const stopChildren = onSnapshot(collection(firestore, 'users', user.uid, 'children'), (snapshot) => {
      setChildren(snapshot.docs.map((childDoc) => {
        const data = childDoc.data();
        return {
          id: childDoc.id,
          name: String(data.name ?? 'Child'),
          deviceName: String(data.deviceName ?? 'Child device'),
          status: String(data.status ?? 'connected'),
        };
      }));
      setLoadError(null);
    }, () => setLoadError('Could not load child devices. Check your connection and try again.'));
    return () => { stopInvites(); stopChildren(); };
  }, [user]);

  const handleCreateCode = async () => {
    if (!user || isCreatingCode) return;
    setIsCreatingCode(true);
    try {
      await createFamilyCode({
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
      });
    } catch (error) {
      Alert.alert('Could not create child code', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsCreatingCode(false);
    }
  };

  const handleCopyCode = async (code: string) => {
    try {
      await Clipboard.setStringAsync(code, { android: { isSensitive: true } });
      setCopiedCode(code);
    } catch {
      Alert.alert('Could not copy code', 'Please try again.');
    }
  };

  const removeChild = async (child: ChildDevice) => {
    if (!user || removingId) return;
    setRemovingId(child.id);
    try {
      const childApps = await getDocs(collection(firestore, 'users', user.uid, 'children', child.id, 'installedApps'));
      const batch = writeBatch(firestore);
      batch.delete(doc(firestore, 'users', user.uid, 'children', child.id));
      batch.delete(doc(firestore, 'childProfiles', child.id));
      childApps.docs.forEach((appDoc) => batch.delete(appDoc.ref));
      await batch.commit();
    } catch {
      Alert.alert('Could not remove device', 'Please check your connection and try again.');
    } finally {
      setRemovingId(null);
    }
  };

  const confirmRemove = (child: ChildDevice) => Alert.alert(
    `Remove ${child.name}?`,
    'This will disconnect the device from your family.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove device', style: 'destructive', onPress: () => { void removeChild(child); } },
    ],
  );

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      await GoogleSignin.signOut();
      router.replace('/');
    } catch {
      Alert.alert('Could not sign out', 'Please try again.');
    }
  };

  if (isLoading || !user) {
    return <SafeAreaView style={styles.safeArea}><View style={styles.centered}><Text style={styles.mutedText}>Opening your family…</Text></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}><Text style={styles.brandMarkText}>N</Text></View>
            <View><Text style={styles.brandName}>nestguard</Text><Text style={styles.brandCaption}>PARENT FAMILY</Text></View>
          </View>
          <Pressable accessibilityRole="button" onPress={handleSignOut} style={({ pressed }) => [styles.signOutButton, pressed && styles.pressed]}>
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>

        <View style={styles.titleBlock}>
          <Text style={styles.eyebrow}>YOUR FAMILY</Text>
          <Text style={styles.title}>Welcome, {user.displayName?.split(/\s+/)[0] ?? 'Parent'}</Text>
          <Text style={styles.subtitle}>Manage the children and devices connected to your family.</Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryCount}>{children.length}</Text>
          <Text style={styles.summaryCaption}>{children.length === 1 ? 'CHILD DEVICE CONNECTED' : 'CHILD DEVICES CONNECTED'}</Text>
        </View>

        {loadError ? <Text accessibilityRole="alert" style={styles.errorText}>{loadError}</Text> : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Child devices</Text>
          <Text style={styles.deviceCount}>{children.length}</Text>
        </View>
        {children.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No child devices yet</Text>
            <Text style={styles.emptyBody}>Create a one-time code for each child device. You can have several active codes at the same time.</Text>
          </View>
        ) : (
          <View style={styles.deviceList}>
            {children.map((child) => (
              <View key={child.id} style={styles.deviceCard}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`View ${child.name}'s profile`}
                  onPress={() => router.push({ pathname: '/child-profile/[childUid]', params: { childUid: child.id } })}
                  style={({ pressed }) => [styles.profileLink, pressed && styles.pressed]}>
                  <View style={styles.deviceIcon}><Text style={styles.deviceIconText}>▯</Text></View>
                  <View style={styles.deviceDetails}>
                    <Text style={styles.deviceName}>{child.name}</Text>
                    <Text style={styles.deviceCaption}>{child.deviceName}</Text>
                    <Text style={styles.deviceStatus}>{child.status}</Text>
                  </View>
                  <Text style={styles.profileArrow}>›</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${child.deviceName}`}
                  disabled={removingId !== null}
                  onPress={() => confirmRemove(child)}
                  style={({ pressed }) => [styles.removeButton, pressed && styles.pressed, removingId !== null && styles.disabled]}>
                  <Text style={styles.removeText}>{removingId === child.id ? 'Removing…' : 'Remove'}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <View style={styles.invitesHeader}>
          <View>
            <Text style={styles.sectionTitle}>Child connection codes</Text>
            <Text style={styles.invitesDescription}>Generate a separate one-time code for each child.</Text>
          </View>
          <Text style={styles.deviceCount}>{familyInvites.filter((invite) => !invite.claimed).length} active</Text>
        </View>
        {familyInvites.map((invite) => (
          <View key={invite.code} style={styles.codeCard}>
            <View style={styles.codeInfo}>
              <Text style={styles.codeValue}>{invite.code.match(/.{1,5}/g)?.join('  ')}</Text>
              <Text style={[styles.codeStatus, invite.claimed && styles.usedCode]}>{invite.claimed ? 'USED' : 'ACTIVE'}</Text>
            </View>
            {!invite.claimed ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Copy code ${invite.code}`}
                onPress={() => { void handleCopyCode(invite.code); }}
                style={({ pressed }) => [styles.copyButton, pressed && styles.pressed]}>
                <Text style={styles.copyText}>{copiedCode === invite.code ? 'Copied' : 'Copy'}</Text>
              </Pressable>
            ) : null}
          </View>
        ))}

        <Pressable
          accessibilityRole="button"
          disabled={isCreatingCode}
          onPress={() => { void handleCreateCode(); }}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, isCreatingCode && styles.disabled]}>
          <Text style={styles.primaryButtonText}>
            {isCreatingCode ? 'Creating code…' : 'Add child device'}
          </Text>
        </Pressable>

        <View style={styles.accountCard}>
          <Text style={styles.accountLabel}>Signed in as</Text>
          <Text numberOfLines={1} style={styles.accountEmail}>{user.email ?? 'Google account'}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 30 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mutedText: { color: colors.muted, fontSize: 13 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 36, height: 36, borderRadius: 13, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: colors.white, fontSize: 17, fontWeight: '900' },
  brandName: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  brandCaption: { color: colors.muted, fontSize: 8, letterSpacing: 1.5, fontWeight: '800', marginTop: 3 },
  signOutButton: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  signOutText: { color: colors.green, fontSize: 11, fontWeight: '800' },
  titleBlock: { marginTop: 31, marginBottom: 19 },
  eyebrow: { color: colors.green, fontSize: 9, fontWeight: '900', letterSpacing: 1.7 },
  title: { color: colors.ink, fontSize: 27, fontWeight: '900', letterSpacing: -0.8, marginTop: 6 },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  summaryCard: { padding: 18, borderRadius: 17, backgroundColor: colors.paleGreen, marginBottom: 24 },
  summaryCount: { color: colors.green, fontSize: 28, fontWeight: '900' },
  summaryCaption: { color: colors.green, fontSize: 8, fontWeight: '900', letterSpacing: 1.1, marginTop: 3 },
  errorText: { color: '#B54747', fontSize: 11, lineHeight: 17, marginBottom: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 },
  sectionTitle: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  deviceCount: { minWidth: 24, textAlign: 'center', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 9, color: colors.green, backgroundColor: colors.paleGreen, fontSize: 10, fontWeight: '900', overflow: 'hidden' },
  emptyCard: { padding: 21, alignItems: 'center', backgroundColor: colors.white, borderRadius: 17, borderWidth: 1, borderColor: colors.border },
  emptyTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  emptyBody: { color: colors.muted, fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 7 },
  deviceList: { gap: 9 },
  deviceCard: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 15, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  profileLink: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 11 },
  deviceIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.paleGreen, alignItems: 'center', justifyContent: 'center' },
  deviceIconText: { color: colors.green, fontSize: 21, fontWeight: '700' },
  deviceDetails: { flex: 1 },
  deviceName: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  deviceCaption: { color: colors.muted, fontSize: 10, marginTop: 3 },
  deviceStatus: { color: colors.green, fontSize: 9, fontWeight: '700', marginTop: 3 },
  profileArrow: { color: colors.muted, fontSize: 22, fontWeight: '500', paddingHorizontal: 2 },
  removeButton: { paddingHorizontal: 9, paddingVertical: 7, borderRadius: 8, backgroundColor: '#FCEDEC' },
  removeText: { color: '#B54747', fontSize: 9, fontWeight: '800' },
  invitesHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 24, marginBottom: 10 },
  invitesDescription: { color: colors.muted, fontSize: 10, marginTop: 4 },
  codeCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 14, borderRadius: 15, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  codeInfo: { flex: 1 },
  codeValue: { color: colors.green, fontSize: 17, letterSpacing: 1.6, fontWeight: '900' },
  copyButton: { paddingHorizontal: 14, paddingVertical: 9, backgroundColor: colors.green, borderRadius: 9 },
  copyText: { color: colors.white, fontSize: 10, fontWeight: '900' },
  codeStatus: { color: colors.green, fontSize: 8, fontWeight: '900', letterSpacing: 1, marginTop: 5 },
  usedCode: { color: colors.muted },
  primaryButton: { minHeight: 49, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, borderRadius: 12, backgroundColor: colors.green, marginTop: 14 },
  primaryButtonText: { color: colors.white, fontSize: 12, fontWeight: '900', textAlign: 'center' },
  accountCard: { padding: 13, borderRadius: 13, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, marginTop: 18 },
  accountLabel: { color: colors.muted, fontSize: 9, fontWeight: '700' },
  accountEmail: { color: colors.ink, fontSize: 11, marginTop: 4 },
  disabled: { opacity: 0.65 },
  pressed: { opacity: 0.78 },
});
