const { withAndroidManifest } = require('@expo/config-plugins');

const withAndroidQueries = (config) => {
  return withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults.manifest;

    if (!androidManifest.queries) {
      androidManifest.queries = [];
    }

    // Add queries for Amazon Seller and eBay app packages
    androidManifest.queries.push(
      { package: [{ $: { 'android:name': 'com.amazon.sellermobile.android' } }] },
      { package: [{ $: { 'android:name': 'com.ebay.mobile' } }] }
    );

    return config;
  });
};

module.exports = withAndroidQueries;
