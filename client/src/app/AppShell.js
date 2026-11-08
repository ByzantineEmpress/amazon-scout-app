import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, StatusBar, BackHandler } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette, space, type, layout } from '../design/theme';
import ScanScreen from '../screens/ScanScreen';
import CompsScreen from '../screens/CompsScreen';
import HistoryScreen from '../screens/HistoryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ItemScreen from '../screens/ItemScreen';

const TABS = [
  { key: 'scan', label: 'Scan', icon: '📷' },
  { key: 'comps', label: 'Comps', icon: '🏷️' },
  { key: 'history', label: 'History', icon: '📜' },
  { key: 'settings', label: 'Settings', icon: '⚙️' }
];

function TabBar({ current, onChange }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, space.sm) }]}>
      {TABS.map((tab) => {
        const active = tab.key === current;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.label}
          >
            <Text style={[styles.tabIcon, !active && styles.tabIconIdle]}>{tab.icon}</Text>
            <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
            {active ? <View style={styles.tabUnderline} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The app shell.
 *
 * Four tabs, one of which is mounted at a time. That is deliberate and load-bearing: only one
 * CameraView may hold the device (see the guide, §4.3), and mounting tabs on demand means the
 * scanner's camera is gone the moment you leave it - the rule is satisfied by the structure rather
 * than by remembering to satisfy it in every screen.
 *
 * Android's back button returns to the Scan tab before it leaves the app, which is what people
 * expect from a tabbed interface.
 */
export default function AppShell({ onSettingsChange }) {
  const [tab, setTab] = useState('scan');
  // One item at a time, shown over the tabs. Because the item replaces the tab content rather than
  // covering it, the scanner unmounts while a result is open - so its camera is released and no
  // scan can fire behind the result.
  const [item, setItem] = useState(null);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (item) {
        setItem(null);
        return true;
      }
      if (tab !== 'scan') {
        setTab('scan');
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [item, tab]);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={palette.bg} />
      <View style={styles.root}>
        {item ? (
          <ItemScreen item={item} onClose={() => setItem(null)} />
        ) : (
          <>
            <View style={styles.content}>
              {tab === 'scan' ? <ScanScreen onNavigate={setTab} onScanned={setItem} /> : null}
              {tab === 'comps' ? <CompsScreen /> : null}
              {tab === 'history' ? <HistoryScreen onItemSelect={setItem} /> : null}
              {tab === 'settings' ? <SettingsScreen onSettingsChange={onSettingsChange} /> : null}
            </View>

            <TabBar current={tab} onChange={setTab} />
          </>
        )}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  content: { flex: 1 },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: palette.surface,
    borderTopWidth: layout.hairline,
    borderTopColor: palette.border,
    paddingTop: space.sm
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.xs,
    gap: 2
  },
  tabPressed: { opacity: 0.7 },
  tabIcon: { fontSize: 20 },
  tabIconIdle: { opacity: 0.55 },
  tabLabel: { ...type.tiny, color: palette.textFaint, textTransform: 'uppercase' },
  tabLabelActive: { color: palette.accent },
  tabUnderline: {
    position: 'absolute',
    top: -1,
    height: 2,
    width: 28,
    borderRadius: 1,
    backgroundColor: palette.accent
  }
});
