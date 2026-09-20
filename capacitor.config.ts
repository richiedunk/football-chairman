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
      backgroundColor: '#08090B',
      overlaysWebView: false,
    },
  },
}

export default config
