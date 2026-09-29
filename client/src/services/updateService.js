import axios from 'axios';
import { Linking } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import appConfig from '../../app.json';

export const CURRENT_VERSION = appConfig.expo?.version || '1.0.0';
const APPLICATION_ID = appConfig.expo?.android?.package;
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
 * The repository is public, so this uses the unauthenticated GitHub API and stores
 * no credentials on the device.
 */
export async function checkForUpdate() {
  try {
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': `AmazonScout/${CURRENT_VERSION}`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache'
    };

    const response = await axios.get(`${GITHUB_LATEST_RELEASE_API}?_t=${Date.now()}`, {
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
        success: false,
        error: 'No releases found or repository is inaccessible (404).'
      };
    }

    return {
      success: false,
      error: err.message || 'Unable to check for updates'
    };
  }
}

/** Only official GitHub HTTPS links are acceptable as an update source. */
export function isTrustedUpdateUrl(downloadUrl) {
  return typeof downloadUrl === 'string' && downloadUrl.startsWith('https://github.com/');
}

/**
 * Opens the download URL in the device browser. Used on iOS, and as the fallback when Android
 * declines an in-app install.
 */
export async function openUpdateDownload(downloadUrl) {
  if (!downloadUrl) return;
  if (!isTrustedUpdateUrl(downloadUrl)) {
    throw new Error('Security Error: Only verified GitHub HTTPS download URLs can be opened.');
  }
  const canOpen = await Linking.canOpenURL(downloadUrl);
  if (canOpen) {
    await Linking.openURL(downloadUrl);
  } else {
    throw new Error('Cannot open download link.');
  }
}

/** Hand a downloaded APK to the system package installer. */
async function launchInstaller(apk) {
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    // A content:// URI rather than file://, which Android has refused to open since API 24, and
    // FLAG_GRANT_READ_URI_PERMISSION so the installer is allowed to read our file.
    data: apk.contentUri,
    type: 'application/vnd.android.package-archive',
    flags: 1
  });
}

/**
 * Download the release APK and hand it straight to Android's installer, so updating happens
 * inside the app rather than by way of a browser and a stray .apk in Downloads.
 *
 * Android will never install silently for an app distributed outside Play - the platform insists
 * on an explicit confirmation - so this is as short as the flow can be: one tap, the download,
 * then the system's own install sheet. Installing over the top preserves the app's data, which
 * works because every release is signed with the same key.
 *
 * `onProgress` receives expo-file-system's DownloadProgress ({ totalBytes, bytesWritten }).
 */
export async function downloadAndInstallUpdate(downloadUrl, onProgress) {
  if (!isTrustedUpdateUrl(downloadUrl)) {
    throw new Error('Security Error: Only verified GitHub HTTPS download URLs can be installed.');
  }

  const directory = new Directory(Paths.cache, 'updates');
  if (!directory.exists) {
    directory.create({ intermediates: true, idempotent: true });
  }

  // idempotent replaces an APK left over from an earlier attempt rather than failing on it.
  const apk = await File.downloadFileAsync(downloadUrl, directory, {
    idempotent: true,
    onProgress: typeof onProgress === 'function' ? onProgress : undefined
  });

  // A truncated download would otherwise surface as a confusing install failure.
  if (!apk.exists || apk.size < 1024 * 1024) {
    throw new Error('The download did not complete. Check your connection and try again.');
  }

  await launchInstaller(apk);
  return apk;
}

/**
 * Open the Android screen where this app may be allowed to install packages. Reached only after
 * an install was refused, which is the normal state on a device that has never done one.
 */
export async function openInstallPermissionSettings() {
  await IntentLauncher.startActivityAsync(
    IntentLauncher.ActivityAction.MANAGE_UNKNOWN_APP_SOURCES,
    { data: `package:${APPLICATION_ID}` }
  );
}
