import { getAuth } from '@react-native-firebase/auth';
import { doc, getFirestore, serverTimestamp, setDoc, updateDoc, writeBatch } from '@react-native-firebase/firestore';
import * as Location from 'expo-location';

const firestore = getFirestore();

export async function startChildLocationSharing(
  parentUid: string,
  childUid: string,
  onError: (error: Error) => void,
) {
  const child = getAuth().currentUser;
  if (!child?.isAnonymous || child.uid !== childUid) {
    throw new Error('Only this connected child device can share its location.');
  }

  const childRef = doc(firestore, 'users', parentUid, 'children', childUid);
  const locationRef = doc(firestore, 'users', parentUid, 'children', childUid, 'liveLocation', 'current');

  await updateDoc(childRef, {
    locationSharingEnabled: true,
    locationSharingUpdatedAt: serverTimestamp(),
  });

  try {
    return await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 15,
        timeInterval: 15000,
      },
      (location) => {
        void setDoc(locationRef, {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy ?? 0,
          updatedAt: serverTimestamp(),
        }).catch((error: unknown) => {
          onError(error instanceof Error ? error : new Error('Could not update the shared location.'));
        });
      },
      (reason) => onError(new Error(reason)),
    );
  } catch (error) {
    await stopChildLocationSharing(parentUid, childUid);
    throw error;
  }
}

export async function stopChildLocationSharing(parentUid: string, childUid: string) {
  const batch = writeBatch(firestore);
  batch.update(doc(firestore, 'users', parentUid, 'children', childUid), {
    locationSharingEnabled: false,
    locationSharingUpdatedAt: serverTimestamp(),
  });
  batch.delete(doc(firestore, 'users', parentUid, 'children', childUid, 'liveLocation', 'current'));
  await batch.commit();
}
