# Nestguard

Family safety app. Each parent manages their own family, and a child connects to that family once using a parent-generated code.

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Set up Firebase Authentication with Google and Anonymous sign-in. For Android, download your Firebase project's `google-services.json` and place it in the project root; keep this project-specific config out of Git.

3. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

## Sign-in and family connection

Parents sign in directly with Google. From the dashboard, parents can create multiple active one-time codes, one for each child device, and share each code with a different child. Each child enters a code and their name once; the app remembers that device’s anonymous Firebase session and opens the connected child screen on future launches. Parents can open a child’s profile from their device card to view the child’s name, device, status, connection time, and family identifiers, and can remove a device from their family.

On Android, the child must acknowledge the app-list sharing notice before joining; already-connected children are asked before sharing begins. Nestguard sends the names, icons, and package identifiers of up to 200 apps with launcher icons to that child’s parent-scoped Firestore records, and refreshes the list when the child app opens after sharing is enabled. The app uses targeted Android package visibility and does not request `QUERY_ALL_PACKAGES`. iOS does not provide an installed-app list. App inventory is sensitive data; configure your privacy policy and Google Play disclosures before distribution.

The child portal includes a privacy and permissions page so children can see what Nestguard accesses. Children can opt in to sharing the Android app list and can turn foreground location sharing on or off themselves. Location permission is requested only when the child starts sharing; the app shares the latest location to the connected parent while Nestguard is open, stops updates when the app goes to the background, and deletes the shared point when sharing is stopped. If the device is offline, the last point may remain visible for up to one minute before it is treated as stale. No background location permission or service is enabled. Microphone, speaker capture, screen sharing, notification contents, app-usage reporting, and SMS are not accessed. The child profile’s controls page lets parents save per-app daily time-limit settings using the received Android app list; these saved settings are not enforced on the child’s device yet. The installed-app inventory requires an Android development build; it is not available in Expo Go.

Deploy the Firestore rules before using family connections and after rule updates (including location sharing):

```bash
firebase deploy --only firestore:rules
```

You can start developing by editing the files inside the **src/app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **example** directory and create a blank **src/app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
