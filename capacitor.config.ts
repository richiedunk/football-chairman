import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.undisclosedfootball.game',
  appName: 'Undisclosed Football',
  webDir: 'dist',
  ios: {
    contentInset: 'always',
    backgroundColor: '#08090B',
  },
  android: {
    backgroundColor: '#08090B',
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      // Android only, and only honoured below Android 15. Targeting API 36
      // means the system enforces edge-to-edge and ignores both of these:
      // the status bar always overlays the WebView and draws no background.
      // They are kept because minSdk is 24 and they still apply on every
      // device running Android 14 or earlier. The layout does not depend on
      // them either way — `.app-shell` pads by env(safe-area-inset-*) and
      // paints --bg behind, which is what makes edge-to-edge look right.
      backgroundColor: '#08090B',
      overlaysWebView: false,
    },
  },
}

export default config
