import axios from 'axios';
import { Linking, Platform } from 'react-native';
import appConfig from '../../app.json';
import { getSettings } from './storage';

export const CURRENT_VERSION = appConfig.expo?.version || '1.0.0';
const GITHUB_REPO = 'ByzantineEmpress/amazon-scout-app';
const GITHUB_LATEST_RELEASE_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

/**
 * Compares two semantic version strings (e.g. "1.0.0" vs "1.0.1" or "v1.0.1").
 * Returns:
 *   1 if v1 > v2
 *  -1 if v1 < v2
 *   0 if v1 === v2
 */
export function compareVersions(v1, v2) {
  const parse = (v) => (v || '').replace(/^v/, '').trim().split('.').map((p) => parseInt(p, 10) || 0);
  const p1 = parse(v1);
  const p2 = parse(v2);

  const len = Math.max(p1.length, p2.length);
  for (let i = 0; i < len; i++) {
    const a = p1[i] || 0;
    const b = p2[i] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

/**
 * Checks GitHub Releases for a newer version of the app.
 */
export async function checkForUpdate() {
  try {
    const settings = await getSettings().catch(() => ({}));
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': `AmazonScout/${CURRENT_VERSION}`
    };

    if (settings?.githubToken) {
      headers['Authorization'] = `token ${settings.githubToken.trim()}`;
    }

    const response = await axios.get(GITHUB_LATEST_RELEASE_API, {
      headers,
      timeout: 8000
    });

    const release = response.data;
    if (!release || !release.tag_name) {
      return {
        success: false,
        error: 'No release found on GitHub.'
      };
    }

    const latestTag = release.tag_name;
    const isNewer = compareVersions(latestTag, CURRENT_VERSION) > 0;

    // Find the APK file among release assets
    const apkAsset = release.assets?.find((asset) => 
      asset.name && asset.name.toLowerCase().endsWith('.apk')
    );

    const downloadUrl = apkAsset?.browser_download_url || release.html_url;

    return {
      success: true,
      updateAvailable: isNewer,
      currentVersion: CURRENT_VERSION,
      latestVersion: latestTag.replace(/^v/, ''),
      latestTag: latestTag,
      title: release.name || latestTag,
      notes: release.body || 'No release notes provided.',
      publishedAt: release.published_at,
      downloadUrl: downloadUrl,
      isDirectApk: !!apkAsset,
      releasePageUrl: release.html_url
    };
  } catch (err) {
    // If repo has no releases yet or rate limited
    if (err.response && err.response.status === 404) {
      return {
        success: true,
        updateAvailable: false,
        currentVersion: CURRENT_VERSION,
        latestVersion: CURRENT_VERSION,
        notes: 'No releases published yet.'
      };
    }

    return {
      success: false,
      error: err.message || 'Unable to check for updates'
    };
  }
}

/**
 * Opens the download URL in the device browser to download and install the update.
 */
export async function openUpdateDownload(downloadUrl) {
  if (!downloadUrl) return;
  const canOpen = await Linking.canOpenURL(downloadUrl);
  if (canOpen) {
    await Linking.openURL(downloadUrl);
  } else {
    throw new Error('Cannot open download link.');
  }
}
