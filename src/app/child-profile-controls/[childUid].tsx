import { getAuth, onAuthStateChanged } from '@react-native-firebase/auth';
import { collection, doc, getDoc, getDocs, getFirestore, onSnapshot, serverTimestamp, updateDoc } from '@react-native-firebase/firestore';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { InstalledApp } from '../../../modules/installed-app-inventory/src';

const auth = getAuth();
const firestore = getFirestore();
const colors = { background: '#F5F7F5', ink: '#182B27', muted: '#75847F', green: '#237A62', paleGreen: '#E7F2ED', border: '#E2E9E5', white: '#FFFFFF', amber: '#9B6B19', paleAmber: '#FFF5DF' };
const staleLocationAfterMs = 60_000;

const timeLimits = ['1 hour', '2 hours', '3 hours', '4 hours', 'No limit'];
const bedtimes = ['8:00 PM', '8:30 PM', '9:00 PM', '9:30 PM', '10:00 PM'];
const weekdays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const appTimeLimitOptions = ['30 min', '1 hour', '2 hours', 'No limit'] as const;
type AppTimeLimit = typeof appTimeLimitOptions[number];
type SavedAppTimeLimit = InstalledApp & { limit: AppTimeLimit };
type SharedLocation = { latitude: number; longitude: number; accuracy: number; updatedAt: unknown };

export default function ChildControlsScreen() {
  const { childUid: routeChildUid } = useLocalSearchParams<{ childUid: string }>();
  const childUid = Array.isArray(routeChildUid) ? routeChildUid[0] : routeChildUid;
  const [childName, setChildName] = useState('Child');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [timeLimit, setTimeLimit] = useState('2 hours');
  const [bedtime, setBedtime] = useState('9:00 PM');
  const [selectedDays, setSelectedDays] = useState([0, 1, 2, 3, 4]);
  const [installedApps, setInstalledApps] = useState<InstalledApp[]>([]);
  const [appIcons, setAppIcons] = useState<Record<string, string>>({});
  const [appIconsError, setAppIconsError] = useState<string | null>(null);
  const [appInventoryPlatform, setAppInventoryPlatform] = useState('');
  const [appInventoryConsent, setAppInventoryConsent] = useState(false);
  const [appTimeLimits, setAppTimeLimits] = useState<SavedAppTimeLimit[]>([]);
  const [selectedAppPackage, setSelectedAppPackage] = useState<string | null>(null);
  const [appSearch, setAppSearch] = useState('');
  const [draftAppTimeLimit, setDraftAppTimeLimit] = useState<AppTimeLimit>('No limit');
  const [isSavingAppLimit, setIsSavingAppLimit] = useState(false);
  const [appLimitError, setAppLimitError] = useState<string | null>(null);
  const [locationSharingEnabled, setLocationSharingEnabled] = useState(false);
  const [sharedLocation, setSharedLocation] = useState<SharedLocation | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationCheckedAt, setLocationCheckedAt] = useState(() => Date.now());

  useEffect(() => {
    let active = true;
    let stopChildStatus: (() => void) | undefined;
    let stopLocation: (() => void) | undefined;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      stopChildStatus?.();
      stopLocation?.();
      stopChildStatus = undefined;
      stopLocation = undefined;
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

      const childRef = doc(firestore, 'users', user.uid, 'children', childUid);
      stopChildStatus = onSnapshot(childRef, (snapshot) => {
        if (!active) return;
        const data = snapshot.data();
        if (!snapshot.exists() || data?.parentUid !== user.uid) {
          setLocationSharingEnabled(false);
          setSharedLocation(null);
          setLocationError('This child is no longer connected to your family.');
          return;
        }
        setLocationSharingEnabled(data.locationSharingEnabled === true);
        setLocationError(null);
      }, () => {
        if (active) setLocationError('Could not load location-sharing status.');
      });
      stopLocation = onSnapshot(doc(firestore, 'users', user.uid, 'children', childUid, 'liveLocation', 'current'), (snapshot) => {
        if (active) {
          setSharedLocation(snapshot.exists() ? readSharedLocation(snapshot.data()) : null);
          setLocationCheckedAt(Date.now());
          setLocationError(null);
        }
      }, () => {
        if (active) setLocationError('Could not load the shared location.');
      });

      getDoc(doc(firestore, 'users', user.uid, 'children', childUid))
        .then((snapshot) => {
          if (!active) return;
          if (!snapshot.exists() || snapshot.data().parentUid !== user.uid) {
            setErrorMessage('This child is no longer connected to your family.');
            return;
          }
          const data = snapshot.data();
          setChildName(typeof data.name === 'string' ? data.name : 'Child');
          setInstalledApps(readInstalledApps(data.installedApps));
          setAppInventoryPlatform(typeof data.appInventoryPlatform === 'string' ? data.appInventoryPlatform : '');
          setAppInventoryConsent(data.appInventoryConsent === true);
          const savedLimits = readSavedAppTimeLimits(data.appTimeLimits);
          setAppTimeLimits(savedLimits);
          const apps = readInstalledApps(data.installedApps);
          setSelectedAppPackage(apps[0]?.packageName ?? null);
          setDraftAppTimeLimit(savedLimits.find((limit) => limit.packageName === apps[0]?.packageName)?.limit ?? 'No limit');
          if (data.appInventoryConsent === true) {
            getDocs(collection(firestore, 'users', user.uid, 'children', childUid, 'installedApps'))
              .then((appSnapshots) => {
                if (!active) return;
                const nextIcons: Record<string, string> = {};
                appSnapshots.docs.forEach((appDoc) => {
                  const iconBase64 = appDoc.data().iconBase64;
                  if (typeof iconBase64 === 'string') nextIcons[appDoc.id] = iconBase64;
                });
                setAppIcons(nextIcons);
              })
              .catch(() => {
                if (active) setAppIconsError('Could not load app icons. Check your connection and try again.');
              });
          }
        })
        .catch(() => {
          if (active) setErrorMessage('Could not load child controls. Check your connection and try again.');
        })
        .finally(() => {
          if (active) setIsLoading(false);
        });
    });
    return () => {
      active = false;
      unsubscribe();
      stopChildStatus?.();
      stopLocation?.();
    };
  }, [childUid]);

  useEffect(() => {
    if (!sharedLocation) return undefined;
    const interval = setInterval(() => setLocationCheckedAt(Date.now()), 10_000);
    return () => clearInterval(interval);
  }, [sharedLocation]);

  const toggleDay = (dayIndex: number) => {
    setSelectedDays((current) => current.includes(dayIndex)
      ? current.filter((day) => day !== dayIndex)
      : [...current, dayIndex].sort((a, b) => a - b));
  };

  const selectApp = (app: InstalledApp) => {
    setSelectedAppPackage(app.packageName);
    setDraftAppTimeLimit(appTimeLimits.find((limit) => limit.packageName === app.packageName)?.limit ?? 'No limit');
    setAppLimitError(null);
  };

  const selectedApp = installedApps.find((app) => app.packageName === selectedAppPackage);
  const selectedSavedLimit = appTimeLimits.find((limit) => limit.packageName === selectedAppPackage);
  const hasAppLimitChanges = Boolean(selectedApp && draftAppTimeLimit !== (selectedSavedLimit?.limit ?? 'No limit'));
  const filteredApps = installedApps
    .filter((app) => app.appName.toLocaleLowerCase().includes(appSearch.trim().toLocaleLowerCase()));
  const locationUpdatedAt = readTimestamp(sharedLocation?.updatedAt);
  const locationAgeMs = locationUpdatedAt ? locationCheckedAt - locationUpdatedAt.getTime() : null;
  const isLocationFresh = locationSharingEnabled
    && sharedLocation !== null
    && locationAgeMs !== null
    && locationAgeMs >= 0
    && locationAgeMs <= staleLocationAfterMs;

  const saveSelectedAppLimit = async () => {
    const parentUid = auth.currentUser?.uid;
    if (!parentUid || !childUid || !selectedApp || !hasAppLimitChanges || isSavingAppLimit) return;

    const updatedLimits = [
      ...appTimeLimits.filter((limit) => limit.packageName !== selectedApp.packageName),
      { ...selectedApp, limit: draftAppTimeLimit },
    ];
    setIsSavingAppLimit(true);
    setAppLimitError(null);
    try {
      await updateDoc(doc(firestore, 'users', parentUid, 'children', childUid), {
        appTimeLimits: updatedLimits,
        appTimeLimitsUpdatedAt: serverTimestamp(),
      });
      setAppTimeLimits(updatedLimits);
    } catch {
      setAppLimitError('Could not save this app limit. Check your connection and try again.');
    } finally {
      setIsSavingAppLimit(false);
    }
  };

  const openSharedLocation = async () => {
    if (!isLocationFresh || !sharedLocation) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${sharedLocation.latitude},${sharedLocation.longitude}`;
    try {
      await Linking.openURL(url);
    } catch {
      setLocationError('Could not open a maps app on this device.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <Text style={styles.backText}>‹  {childName}’s profile</Text>
        </Pressable>

        <View style={styles.titleBlock}>
          <Text style={styles.eyebrow}>PARENT CONTROLS</Text>
          <Text style={styles.title}>{isLoading ? 'Loading controls…' : `${childName}’s controls`}</Text>
          <Text style={styles.subtitle}>Review Android app names and configure per-app time limits.</Text>
        </View>

        <View style={styles.noticeCard}>
          <Text style={styles.noticeTitle}>App limits are saved, not enforced</Text>
          <Text style={styles.noticeBody}>App time limits are saved to this family’s settings, but they do not restrict app use on the child’s device yet. The other controls remain a preview.</Text>
        </View>

        {errorMessage ? (
          <View style={styles.errorCard}>
            <Text accessibilityRole="alert" style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : !isLoading ? (
          <>
            <View style={styles.controlCard}>
              <View style={styles.controlText}>
                <Text style={styles.controlTitle}>Pause device</Text>
                <Text style={styles.controlDescription}>Temporarily pause device access</Text>
              </View>
              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: isPaused }}
                accessibilityLabel={isPaused ? 'Resume device preview' : 'Pause device preview'}
                onPress={() => setIsPaused((paused) => !paused)}
                style={[styles.switchTrack, isPaused && styles.switchTrackOn]}>
                <View style={[styles.switchThumb, isPaused && styles.switchThumbOn]} />
              </Pressable>
            </View>

            <View style={styles.controlCard}>
              <View style={styles.controlText}>
                <Text style={styles.controlTitle}>Daily screen-time limit</Text>
                <Text style={styles.controlDescription}>Choose a daily allowance</Text>
              </View>
              <View style={styles.optionsWrap}>
                {timeLimits.map((option) => (
                  <OptionButton key={option} label={option} selected={timeLimit === option} onPress={() => setTimeLimit(option)} />
                ))}
              </View>
            </View>

            <View style={styles.controlCard}>
              <View style={styles.controlText}>
                <Text style={styles.controlTitle}>Bedtime schedule</Text>
                <Text style={styles.controlDescription}>Select bedtime and active days</Text>
              </View>
              <View style={styles.optionsWrap}>
                {bedtimes.map((option) => (
                  <OptionButton key={option} label={option} selected={bedtime === option} onPress={() => setBedtime(option)} />
                ))}
              </View>
              <View style={styles.daysRow}>
                {weekdays.map((day, index) => {
                  const selected = selectedDays.includes(index);
                  return (
                    <Pressable
                      key={`${day}-${index}`}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={`Toggle bedtime for day ${index + 1}`}
                      onPress={() => toggleDay(index)}
                      style={[styles.dayButton, selected && styles.dayButtonSelected]}>
                      <Text style={[styles.dayText, selected && styles.dayTextSelected]}>{day}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.controlCard}>
              <Text style={styles.controlTitle}>Installed apps</Text>
              <Text style={styles.controlDescription}>Android app names and icons shared by this child device.</Text>
              <Text style={styles.inventoryCount}>{installedApps.length} {installedApps.length === 1 ? 'app' : 'apps'} · {appInventoryPlatform === 'android' ? 'Android' : 'inventory unavailable'}</Text>
              {installedApps.length > 0 ? (
                <>
                  <TextInput
                    accessibilityLabel="Search installed apps"
                    value={appSearch}
                    onChangeText={setAppSearch}
                    placeholder="Search apps"
                    placeholderTextColor="#A3ADA8"
                    style={styles.appSearch}
                  />
                  <ScrollView
                    accessibilityLabel="Installed apps"
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                    showsVerticalScrollIndicator
                    style={styles.appListScroll}>
                    {filteredApps.map((app) => {
                      const savedLimit = appTimeLimits.find((limit) => limit.packageName === app.packageName);
                      const isSelected = selectedAppPackage === app.packageName;
                      return (
                        <Pressable
                          key={app.packageName}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: isSelected }}
                          onPress={() => selectApp(app)}
                          style={[styles.appRow, isSelected && styles.appRowSelected]}>
                          {appIcons[app.packageName] ? (
                            <Image
                              accessibilityLabel={`${app.appName} icon`}
                              source={{ uri: `data:image/png;base64,${appIcons[app.packageName]}` }}
                              style={styles.appIcon}
                            />
                          ) : (
                            <View accessibilityElementsHidden style={styles.appIconFallback}>
                              <Text style={styles.appIconFallbackText}>{app.appName.slice(0, 1).toUpperCase()}</Text>
                            </View>
                          )}
                          <Text numberOfLines={1} style={styles.appName}>{app.appName}</Text>
                          <Text style={styles.appLimitSummary}>{savedLimit?.limit ?? 'No limit'}</Text>
                        </Pressable>
                      );
                    })}
                    {filteredApps.length === 0 ? <Text style={styles.emptySearch}>No apps match “{appSearch}”.</Text> : null}
                  </ScrollView>
                  {appIconsError ? <Text accessibilityRole="alert" style={styles.inlineErrorText}>{appIconsError}</Text> : null}
                  {selectedApp ? (
                    <View style={styles.appLimitEditor}>
                      <Text style={styles.sectionLabel}>Daily limit for {selectedApp.appName}</Text>
                      <View style={styles.optionsWrap}>
                        {appTimeLimitOptions.map((option) => (
                          <OptionButton key={option} label={option} selected={draftAppTimeLimit === option} onPress={() => setDraftAppTimeLimit(option)} />
                        ))}
                      </View>
                      {appLimitError ? <Text accessibilityRole="alert" style={styles.inlineErrorText}>{appLimitError}</Text> : null}
                      <Pressable
                        accessibilityRole="button"
                        disabled={!hasAppLimitChanges || isSavingAppLimit}
                        onPress={() => { void saveSelectedAppLimit(); }}
                        style={[styles.saveButton, (!hasAppLimitChanges || isSavingAppLimit) && styles.saveButtonDisabled]}>
                        <Text style={styles.saveButtonText}>{isSavingAppLimit ? 'Saving…' : hasAppLimitChanges ? 'Save app limit' : 'Limit saved'}</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </>
              ) : (
                <Text style={styles.emptyState}>
                  {appInventoryPlatform === 'android'
                    ? appInventoryConsent
                      ? 'No launchable apps were received yet. Reopen the child app while online to sync its list.'
                      : 'The child has not opted in to sharing app names yet. They can review the notice on their device.'
                    : 'Installed-app names are available only from Android child devices.'}
                </Text>
              )}
            </View>

            <View style={styles.controlCard}>
              <View style={styles.controlText}>
                <Text style={styles.controlTitle}>App usage time</Text>
                <Text style={styles.controlDescription}>Usage history is not collected</Text>
              </View>
              <Text style={styles.emptyState}>Only installed app names are shared. Time spent in each app is not measured or reported.</Text>
            </View>

            <View style={styles.controlCard}>
              <Text style={styles.controlTitle}>Live device information</Text>
              <Text style={styles.controlDescription}>Live location is child-controlled. Other live features are not connected.</Text>
              <View style={styles.liveFeatureList}>
                <View style={styles.liveFeature}>
                  <View style={styles.liveFeatureHeading}>
                    <Text style={styles.liveFeatureTitle}>Live location</Text>
                    <Text style={[styles.unavailableLabel, isLocationFresh && styles.locationActiveLabel]}>
                      {isLocationFresh ? 'Live now' : locationSharingEnabled ? 'Waiting / stale' : 'Sharing off'}
                    </Text>
                  </View>
                  <Text style={styles.liveFeatureDescription}>
                    {isLocationFresh && sharedLocation && locationUpdatedAt
                      ? `Updated ${formatLocationAge(locationAgeMs ?? 0)} · accuracy about ${Math.round(sharedLocation.accuracy)} m`
                      : locationSharingEnabled
                        ? sharedLocation
                          ? 'The last point is too old to show as live. Ask the child to reopen Nestguard.'
                          : 'Waiting for the child device to send its first location update.'
                        : 'The child has not enabled location sharing. Location is visible only while the child app is open; old points are hidden after one minute.'}
                  </Text>
                  {locationError ? <Text accessibilityRole="alert" style={styles.inlineErrorText}>{locationError}</Text> : null}
                  {isLocationFresh ? (
                    <Pressable accessibilityRole="button" onPress={() => { void openSharedLocation(); }} style={({ pressed }) => [styles.mapButton, pressed && styles.pressed]}>
                      <Text style={styles.mapButtonText}>Open in Maps</Text>
                    </Pressable>
                  ) : null}
                </View>
                <UnavailableFeature title="Live screen" description="No screenshots or screen recordings are captured." />
                <UnavailableFeature title="Notifications" description="Notification contents are not collected." />
                <UnavailableFeature title="SMS" description="SMS messages and their contents are not collected." />
              </View>
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function OptionButton({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.optionButton, selected && styles.optionButtonSelected]}>
      <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function readInstalledApps(value: unknown): InstalledApp[] {
  if (!Array.isArray(value)) return [];
  return value.filter((app): app is InstalledApp => (
    typeof app === 'object'
    && app !== null
    && 'packageName' in app
    && typeof app.packageName === 'string'
    && 'appName' in app
    && typeof app.appName === 'string'
  )).slice(0, 200);
}

function readSavedAppTimeLimits(value: unknown): SavedAppTimeLimit[] {
  if (!Array.isArray(value)) return [];
  return value.filter((limit): limit is SavedAppTimeLimit => (
    typeof limit === 'object'
    && limit !== null
    && 'packageName' in limit
    && typeof limit.packageName === 'string'
    && 'appName' in limit
    && typeof limit.appName === 'string'
    && 'limit' in limit
    && typeof limit.limit === 'string'
    && appTimeLimitOptions.some((option) => option === limit.limit)
  ));
}

function readSharedLocation(value: Record<string, unknown>): SharedLocation | null {
  const { latitude, longitude, accuracy, updatedAt } = value;
  if (
    typeof latitude !== 'number'
    || typeof longitude !== 'number'
    || typeof accuracy !== 'number'
  ) return null;
  return { latitude, longitude, accuracy, updatedAt };
}

function readTimestamp(value: unknown): Date | null {
  if (typeof value !== 'object' || value === null || !('toDate' in value) || typeof value.toDate !== 'function') return null;
  return value.toDate();
}

function formatLocationAge(ageMs: number) {
  const seconds = Math.max(0, Math.floor(ageMs / 1000));
  return seconds < 60 ? `${seconds} sec ago` : `${Math.floor(seconds / 60)} min ago`;
}

function UnavailableFeature({ title, description }: { title: string; description: string }) {
  return (
    <View style={styles.liveFeature}>
      <View style={styles.liveFeatureHeading}>
        <Text style={styles.liveFeatureTitle}>{title}</Text>
        <Text style={styles.unavailableLabel}>Not connected</Text>
      </View>
      <Text style={styles.liveFeatureDescription}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 12 },
  backText: { color: colors.green, fontSize: 12, fontWeight: '800' },
  titleBlock: { marginTop: 18, marginBottom: 18 },
  eyebrow: { color: colors.green, fontSize: 9, fontWeight: '900', letterSpacing: 1.7 },
  title: { color: colors.ink, fontSize: 27, lineHeight: 33, fontWeight: '900', letterSpacing: -0.8, marginTop: 6 },
  subtitle: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  noticeCard: { padding: 14, borderRadius: 14, backgroundColor: colors.paleAmber, borderWidth: 1, borderColor: '#F1E2BF', marginBottom: 14 },
  noticeTitle: { color: colors.amber, fontSize: 11, fontWeight: '900' },
  noticeBody: { color: '#80652F', fontSize: 10, lineHeight: 15, marginTop: 4 },
  controlCard: { padding: 16, borderRadius: 17, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, marginBottom: 11 },
  controlText: { marginBottom: 12 },
  controlTitle: { color: colors.ink, fontSize: 13, fontWeight: '900' },
  controlDescription: { color: colors.muted, fontSize: 10, marginTop: 4 },
  sectionLabel: { color: colors.ink, fontSize: 10, fontWeight: '800', marginTop: 14, marginBottom: 8 },
  inventoryCount: { color: colors.muted, fontSize: 10, marginTop: 7 },
  appSearch: { minHeight: 42, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, marginTop: 13, marginBottom: 9, color: colors.ink, fontSize: 12 },
  appListScroll: { maxHeight: 300, borderRadius: 12, backgroundColor: '#F3F6F4' },
  appRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  appRowSelected: { backgroundColor: colors.paleGreen, borderColor: '#BFD9CC' },
  appIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.white },
  appIconFallback: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paleGreen },
  appIconFallbackText: { color: colors.green, fontSize: 15, fontWeight: '900' },
  appName: { flex: 1, color: colors.ink, fontSize: 11, fontWeight: '700' },
  appLimitSummary: { color: colors.green, fontSize: 10, fontWeight: '800' },
  emptySearch: { color: colors.muted, fontSize: 11, textAlign: 'center', padding: 18 },
  appLimitEditor: { marginTop: 5 },
  saveButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.green, marginTop: 13, paddingHorizontal: 12 },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: colors.white, fontSize: 11, fontWeight: '800' },
  inlineErrorText: { color: '#B54747', fontSize: 10, lineHeight: 15, marginTop: 8 },
  emptyState: { color: colors.muted, fontSize: 10, lineHeight: 16, padding: 12, borderRadius: 10, backgroundColor: '#F3F6F4' },
  liveFeatureList: { gap: 9, marginTop: 14 },
  liveFeature: { padding: 11, borderRadius: 11, backgroundColor: '#F3F6F4' },
  liveFeatureHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  liveFeatureTitle: { color: colors.ink, fontSize: 11, fontWeight: '800' },
  unavailableLabel: { color: colors.amber, fontSize: 9, fontWeight: '800' },
  locationActiveLabel: { color: colors.green },
  liveFeatureDescription: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 4 },
  mapButton: { minHeight: 38, alignItems: 'center', justifyContent: 'center', marginTop: 10, paddingHorizontal: 12, borderRadius: 9, backgroundColor: colors.green },
  mapButtonText: { color: colors.white, fontSize: 10, fontWeight: '800' },
  switchTrack: { width: 48, height: 28, borderRadius: 15, backgroundColor: '#DDE4E0', justifyContent: 'center', padding: 3, alignSelf: 'flex-end' },
  switchTrackOn: { backgroundColor: colors.green },
  switchThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.white, elevation: 1 },
  switchThumbOn: { alignSelf: 'flex-end' },
  optionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionButton: { minHeight: 35, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 10, backgroundColor: '#F3F6F4', borderWidth: 1, borderColor: '#E7ECE9' },
  optionButtonSelected: { backgroundColor: colors.paleGreen, borderColor: '#BFD9CC' },
  optionText: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  optionTextSelected: { color: colors.green, fontWeight: '900' },
  daysRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  dayButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F6F4' },
  dayButtonSelected: { backgroundColor: colors.green },
  dayText: { color: colors.muted, fontSize: 10, fontWeight: '800' },
  dayTextSelected: { color: colors.white },
  errorCard: { padding: 15, borderRadius: 14, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  errorText: { color: '#B54747', fontSize: 12, lineHeight: 18 },
  pressed: { opacity: 0.75 },
});
