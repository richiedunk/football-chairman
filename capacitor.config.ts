import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.directoroffootball.game',
  appName: 'Director of Football',
  webDir: 'dist',
  ios: {
    contentInset: 'always',
    backgroundColor: '#0b1220',
  },
  android: {
    backgroundColor: '#0b1220',
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0b1220',
      overlaysWebView: false,
    },
  },
}

export default config
