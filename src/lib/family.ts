import { getAuth, signInAnonymously } from '@react-native-firebase/auth';
import {
  doc,
  collection,
  getDocs,
  getDoc,
  getFirestore,
  runTransaction,
  serverTimestamp,
  writeBatch,
} from '@react-native-firebase/firestore';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { getLaunchableApps } from '../../modules/installed-app-inventory/src';

const db = getFirestore();
const codeAlphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

async function makeFamilyCode() {
  const bytes = await Crypto.getRandomBytesAsync(10);
  return Array.from(bytes, (byte) => codeAlphabet[byte & 31]).join('');
}

export async function createFamilyCode(parent: {
  uid: string;
  displayName: string | null;
  email: string | null;
}) {
  const parentRef = doc(db, 'users', parent.uid);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = await makeFamilyCode();
    const codeRef = doc(db, 'familyCodes', code);

    try {
      await runTransaction(db, async (transaction) => {
        const codeSnapshot = await transaction.get(codeRef);
        if (codeSnapshot.exists()) throw new Error('CODE_COLLISION');

        transaction.set(parentRef, {
          role: 'parent',
          displayName: parent.displayName ?? 'Parent',
          email: parent.email,
        }, { merge: true });
        transaction.set(codeRef, {
          parentUid: parent.uid,
          parentName: parent.displayName ?? 'Parent',
          active: true,
          claimed: false,
          createdAt: serverTimestamp(),
        });
      });
      return code;
    } catch (error) {
      if (error instanceof Error && error.message === 'CODE_COLLISION') continue;
      throw error;
    }
  }

  throw new Error('Could not create a unique family code. Please try again.');
}

export async function joinFamilyWithCode(input: { code: string; childName: string; appInventoryConsent: boolean }) {
  if (Platform.OS === 'android' && !input.appInventoryConsent) {
    throw new Error('Review and accept the app-list sharing notice before joining on Android.');
  }

  const auth = getAuth();
  if (auth.currentUser && !auth.currentUser.isAnonymous) {
    throw new Error('Sign out of the parent account before joining as a child.');
  }

  const child = auth.currentUser ?? (await signInAnonymously(auth)).user;
  const code = input.code.trim().toUpperCase().replace(/[^2-9A-HJ-NP-Z]/g, '');
  if (code.length !== 10) throw new Error('Enter the 10-character family code.');
  const deviceName = Device.deviceName ?? Device.modelName ?? 'Child device';

  const codeRef = doc(db, 'familyCodes', code);
  const initialCode = await getDoc(codeRef);
  if (!initialCode.exists() || !initialCode.data()?.active || initialCode.data()?.claimed) {
    throw new Error('That family code is invalid or has already been used. Ask your parent for a new one.');
  }

  let parentUid = '';
  let parentName = 'your parent';
  const safeChildName = input.childName.trim().slice(0, 40);
  if (!safeChildName) throw new Error('Enter your name to join your family.');
  const installedApps = await getLaunchableApps();
  const appSummaries = installedApps.map(({ packageName, appName }) => ({ packageName, appName }));

  const childProfileRef = doc(db, 'childProfiles', child.uid);
  await runTransaction(db, async (transaction) => {
    const codeSnapshot = await transaction.get(codeRef);
    if (!codeSnapshot.exists() || !codeSnapshot.data()?.active || codeSnapshot.data()?.claimed) {
      throw new Error('That family code is invalid or has already been used. Ask your parent for a new one.');
    }

    const codeData = codeSnapshot.data();
    if (!codeData) throw new Error('That family code is invalid. Ask your parent for a new one.');
    parentUid = codeData.parentUid as string;
    parentName = (codeData.parentName as string | undefined) ?? 'your parent';
    const childRef = doc(db, 'users', parentUid, 'children', child.uid);

    transaction.update(codeRef, {
      claimed: true,
      childUid: child.uid,
      childName: safeChildName,
    });
    transaction.set(childRef, {
      uid: child.uid,
      name: safeChildName,
      deviceName,
      parentUid,
      parentName,
      familyCode: code,
      status: 'connected',
      connectedAt: serverTimestamp(),
      installedApps: appSummaries,
      appInventoryPlatform: Platform.OS,
      appInventoryConsent: Platform.OS === 'android',
      appInventoryUpdatedAt: serverTimestamp(),
    });
    transaction.set(childProfileRef, {
      uid: child.uid,
      name: safeChildName,
      deviceName,
      parentUid,
      parentName,
      familyCode: code,
      joinedAt: serverTimestamp(),
      appInventoryConsent: Platform.OS === 'android',
    });
  });

  return { childUid: child.uid, parentUid, parentName, childName: safeChildName };
}

export async function syncInstalledApps(parentUid: string, acceptSharing = false) {
  if (Platform.OS !== 'android') return;

  const child = getAuth().currentUser;
  if (!child?.isAnonymous) {
    throw new Error('Only a connected child device can sync its installed apps.');
  }

  const installedApps = await getLaunchableApps();
  const appSummaries = installedApps.map(({ packageName, appName }) => ({ packageName, appName }));
  const batch = writeBatch(db);
  batch.update(doc(db, 'users', parentUid, 'children', child.uid), {
    installedApps: appSummaries,
    appInventoryPlatform: Platform.OS,
    ...(acceptSharing ? { appInventoryConsent: true } : {}),
    appInventoryUpdatedAt: serverTimestamp(),
  });
  const installedAppsRef = collection(db, 'users', parentUid, 'children', child.uid, 'installedApps');
  const currentApps = await getDocs(installedAppsRef);
  const appIds = new Set(installedApps.map((app) => app.packageName));
  const currentAppsById = new Map(currentApps.docs.map((appDoc) => [appDoc.id, appDoc.data()]));

  currentApps.docs.forEach((appDoc) => {
    if (!appIds.has(appDoc.id)) batch.delete(appDoc.ref);
  });
  installedApps.forEach((app) => {
    const currentApp = currentAppsById.get(app.packageName);
    if (currentApp?.appName === app.appName && currentApp.iconBase64 === app.iconBase64) return;

    batch.set(doc(installedAppsRef, app.packageName), {
      packageName: app.packageName,
      appName: app.appName,
      ...(app.iconBase64 ? { iconBase64: app.iconBase64 } : {}),
      updatedAt: serverTimestamp(),
    });
  });
  if (acceptSharing) {
    batch.update(doc(db, 'childProfiles', child.uid), { appInventoryConsent: true });
  }
  await batch.commit();
}

export async function signOutChild() {
  const auth = getAuth();
  if (auth.currentUser?.isAnonymous) await auth.signOut();
}
