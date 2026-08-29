/**
 * The platform seam.
 *
 * Achievements, purchases and sign-in all need a real developer account, real
 * signing certificates and a real device before any of them can be tested.
 * None of that is a reason to leave the game with no idea they exist: what it
 * is a reason for is putting the boundary in now, so the game calls
 * `achievements.report(...)` and `purchases.buy(...)` today and the
 * implementations land behind them later without a line changing upstream.
 *
 * Every provider here is a no-op that reports itself unavailable. On the web
 * that is the permanent answer and the game is expected to work perfectly
 * well with it — the achievements screen reads from the engine, not from Play
 * Games, and nothing is gated behind a purchase.
 *
 * One correction worth stating where it will be read: **Apple Pay and Google
 * Pay cannot carry an in-game purchase.** They are for physical goods.
 * Anything consumed inside the app goes through StoreKit and Google Play
 * Billing, which is why the purchase interface below talks about products and
 * restoring entitlements rather than about taking a payment.
 */

import { isNative, platform } from './native'

export interface PlatformCapabilities {
  achievements: boolean
  leaderboards: boolean
  purchases: boolean
  signIn: boolean
  cloudSave: boolean
}

/** What this build can actually do. Every screen should ask before offering. */
export function capabilities(): PlatformCapabilities {
  // Deliberately all false until a real provider is wired in. A capability
  // that claims to exist and then throws is worse than one that says no.
  const native = isNative()
  return {
    achievements: false && native,
    leaderboards: false && native,
    purchases: false && native,
    signIn: false && native,
    cloudSave: false && native,
  }
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

export interface AchievementService {
  /**
   * Report the full set of earned achievement ids.
   *
   * Idempotent by design: the caller hands over everything the save has ever
   * earned and this decides what is new. Both Play Games and Game Center treat
   * unlocking an already-unlocked achievement as a no-op, and a seam that
   * required the caller to track deltas would push per-platform bookkeeping
   * into the game.
   */
  report(earnedIds: readonly string[]): Promise<void>
  /** Open the platform's own achievements UI, if it has one. */
  show(): Promise<boolean>
}

const reported = new Set<string>()

export const achievements: AchievementService = {
  async report(earnedIds) {
    for (const id of earnedIds) {
      if (reported.has(id)) continue
      reported.add(id)
      if (!capabilities().achievements) continue
      // Play Games: Games.unlockAchievement(mapped id)
      // Game Center: GKAchievement percentComplete 100
    }
  },
  async show() {
    return false
  },
}

/** Test seam: forget what has been reported. */
export function resetReportedAchievements(): void {
  reported.clear()
}

// ---------------------------------------------------------------------------
// Purchases
// ---------------------------------------------------------------------------

export type ProductId = 'xp-boost-small' | 'xp-boost-large'

export interface Product {
  id: ProductId
  name: string
  description: string
  /** Localised price string from the store, e.g. "£2.99". Null when unknown. */
  price: string | null
}

export type PurchaseOutcome =
  | { status: 'unavailable' }
  | { status: 'purchased'; productId: ProductId }
  | { status: 'cancelled' }
  | { status: 'failed'; reason: string }

export interface PurchaseService {
  products(): Promise<Product[]>
  buy(productId: ProductId): Promise<PurchaseOutcome>
  /**
   * Restore entitlements bought on another device or before a reinstall.
   * Both stores require this to be offered, not merely possible.
   */
  restore(): Promise<ProductId[]>
}

export const purchases: PurchaseService = {
  async products() {
    return []
  },
  async buy() {
    return { status: 'unavailable' }
  },
  async restore() {
    return []
  },
}

// ---------------------------------------------------------------------------
// Sign-in
// ---------------------------------------------------------------------------

export type SignInProvider = 'apple' | 'google'

export interface AccountIdentity {
  provider: SignInProvider
  /** Stable per-app identifier. Never an email address. */
  userId: string
  displayName: string | null
}

export interface AuthService {
  /**
   * Providers this build can offer.
   *
   * Apple's rule matters here and is easy to trip over: offer any third-party
   * sign-in on iOS and Sign in with Apple has to be offered alongside it. The
   * list is therefore computed, not hard-coded per screen.
   */
  availableProviders(): SignInProvider[]
  signIn(provider: SignInProvider): Promise<AccountIdentity | null>
  signOut(): Promise<void>
  current(): AccountIdentity | null
}

export const auth: AuthService = {
  availableProviders() {
    if (!capabilities().signIn) return []
    const providers: SignInProvider[] = ['google']
    if (platform() === 'ios' && !providers.includes('apple')) providers.unshift('apple')
    return providers
  },
  async signIn() {
    return null
  },
  async signOut() {
    // Nothing to sign out of.
  },
  current() {
    return null
  },
}
