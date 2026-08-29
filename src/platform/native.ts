/**
 * Native platform integration.
 *
 * Every call is guarded, because the same bundle runs in a browser where none
 * of these plugins exist. Nothing here is required for the game to work — it
 * is the layer that stops a web app running inside a native shell feeling like
 * a web app running inside a native shell.
 */

import { Capacitor } from '@capacitor/core'

export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

export function platform(): string {
  try {
    return Capacitor.getPlatform()
  } catch {
    return 'web'
  }
}

/**
 * One-time native setup. Failures are swallowed deliberately: a status-bar
 * call that throws on some OEM Android build must not stop the game booting.
 */
export async function initialiseNative(): Promise<void> {
  if (!isNative()) return

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    await StatusBar.setStyle({ style: Style.Dark })
    if (platform() === 'android') {
      await StatusBar.setBackgroundColor({ color: '#0b1220' })
    }
  } catch {
    // Status bar styling is cosmetic; carry on without it.
  }
}

/**
 * Wire the Android hardware back button to router history.
 *
 * Without this, back exits the app from any screen — the single most jarring
 * thing about an unadapted web app on Android.
 */
export async function bindBackButton(
  canGoBack: () => boolean,
  goBack: () => void,
): Promise<() => void> {
  if (!isNative() || platform() !== 'android') return () => {}

  try {
    const { App } = await import('@capacitor/app')
    const handle = await App.addListener('backButton', () => {
      if (canGoBack()) goBack()
      else void App.exitApp()
    })
    return () => void handle.remove()
  } catch {
    return () => {}
  }
}

/** Save when the app is backgrounded — mobile OSes kill apps without warning. */
export async function bindAppStateChange(onBackground: () => void): Promise<() => void> {
  if (!isNative()) {
    // The browser equivalent: a tab being hidden or closed.
    if (typeof document !== 'undefined') {
      const handler = () => {
        if (document.visibilityState === 'hidden') onBackground()
      }
      document.addEventListener('visibilitychange', handler)
      return () => document.removeEventListener('visibilitychange', handler)
    }
    return () => {}
  }

  try {
    const { App } = await import('@capacitor/app')
    const handle = await App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) onBackground()
    })
    return () => void handle.remove()
  } catch {
    return () => {}
  }
}

export type HapticWeight = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error'

/**
 * Haptic feedback. Used sparingly — on advancing a week, on a decision landing,
 * and on a transfer completing. Buzzing on every tap is worse than silence.
 */
export async function haptic(weight: HapticWeight = 'light'): Promise<void> {
  if (!isNative()) return
  try {
    const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics')
    if (weight === 'success' || weight === 'warning' || weight === 'error') {
      const type = {
        success: NotificationType.Success,
        warning: NotificationType.Warning,
        error: NotificationType.Error,
      }[weight]
      await Haptics.notification({ type })
      return
    }
    const style = {
      light: ImpactStyle.Light,
      medium: ImpactStyle.Medium,
      heavy: ImpactStyle.Heavy,
    }[weight]
    await Haptics.impact({ style })
  } catch {
    // Haptics are a nicety; a device without a taptic engine is not an error.
  }
}
