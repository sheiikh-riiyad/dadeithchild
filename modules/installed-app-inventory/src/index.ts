import { requireNativeModule } from 'expo';
import { Platform } from 'react-native';

export type InstalledApp = {
  packageName: string;
  appName: string;
  iconBase64?: string;
};

type InstalledAppInventoryModule = {
  getLaunchableApps: () => Promise<InstalledApp[]>;
};

export async function getLaunchableApps(): Promise<InstalledApp[]> {
  if (Platform.OS !== 'android') return [];

  try {
    const module = requireNativeModule<InstalledAppInventoryModule>('NestguardInstalledAppInventory');
    const apps = await module.getLaunchableApps();
    return apps
      .filter((app) => typeof app.packageName === 'string' && typeof app.appName === 'string')
      .slice(0, 200)
      .map((app) => ({
        packageName: app.packageName,
        appName: app.appName,
        ...(typeof app.iconBase64 === 'string' ? { iconBase64: app.iconBase64 } : {}),
      }));
  } catch (error) {
    throw new Error(
      'Installed app names require the Android development build. Rebuild and reinstall the app, then try again.',
      { cause: error },
    );
  }
}
