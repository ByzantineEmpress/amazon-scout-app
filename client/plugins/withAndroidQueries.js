const { withAndroidManifest } = require('@expo/config-plugins');

const withAndroidQueries = (config) => {
  return withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults.manifest;

    if (!androidManifest.queries) {
      androidManifest.queries = [];
    }

    // Add query for Amazon Seller app package
    androidManifest.queries.push({
      package: [
        { $: { 'android:name': 'com.amazon.sellermobile.android' } }
      ]
    });

    return config;
  });
};

module.exports = withAndroidQueries;
