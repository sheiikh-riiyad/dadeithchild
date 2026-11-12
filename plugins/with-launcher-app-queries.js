const { withAndroidManifest } = require('@expo/config-plugins');

const launcherAction = 'android.intent.action.MAIN';
const launcherCategory = 'android.intent.category.LAUNCHER';

function withLauncherAppQueries(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const queries = manifest.queries ?? [];
    const hasLauncherQuery = queries.some((query) => query.intent?.some((intent) => (
      intent.action?.some((action) => action.$['android:name'] === launcherAction)
      && intent.category?.some((category) => category.$['android:name'] === launcherCategory)
    )));

    if (!hasLauncherQuery) {
      const launcherIntent = {
        action: [{ $: { 'android:name': launcherAction } }],
        category: [{ $: { 'android:name': launcherCategory } }],
      };
      if (queries.length > 0) {
        queries[0].intent = [...(queries[0].intent ?? []), launcherIntent];
      } else {
        queries.push({ intent: [launcherIntent] });
      }
    }

    manifest.queries = queries;
    return config;
  });
}

module.exports = withLauncherAppQueries;
