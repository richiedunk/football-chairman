/**
 * The apps on the phone.
 *
 * The game had thirty screens pushed through five tabs, which meant four of
 * them were doorways: Finance, the boardroom, the academy, the ground, the
 * press and the rest were all reached by drilling down through "Club". A tab
 * bar with five slots is the wrong shape for a game with this many surfaces,
 * and the drill-down was the tax.
 *
 * A home screen of apps is the right shape, and it is the shape the fiction
 * has been asking for since the inbox became a conversation. Every surface is
 * one tap from home, each one can carry a badge saying whether it wants
 * something, and adding a surface costs an icon rather than another level of
 * menu.
 *
 * Declared as data rather than markup so the grid, the badges and the tests
 * all read from one list.
 */

export interface PhoneApp {
  id: string
  label: string
  to: string
  /** SVG path, stroked, on the same 24x24 grid as the rest of the icons. */
  d: string
  /** A second path, where one line will not draw it. */
  extra?: string
  /**
   * Which count sits on the icon, if any. Named rather than computed here so
   * this file stays free of the store — the home screen does the looking up.
   *
   * A badge means "this wants something from you", never "this has contents".
   * A number on an icon that is always there is a number nobody reads.
   */
  badge?: 'unread' | 'decisions' | 'deadline' | 'milestones' | 'registration'
}

export const PHONE_APPS: PhoneApp[] = [
  {
    id: 'inbox', label: 'Messages', to: '/inbox', badge: 'unread',
    d: 'M4 4h16v16H4zM4 8l8 5 8-5',
  },
  {
    id: 'home', label: 'Club', to: '/home',
    d: 'M3 10l9-7 9 7v10a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  },
  {
    id: 'squad', label: 'Squad', to: '/squad', badge: 'registration',
    d: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M23 21v-2a4 4 0 00-3-3.87',
    extra: 'M9 3a4 4 0 100 8 4 4 0 000-8z',
  },
  {
    id: 'transfers', label: 'Market', to: '/transfers', badge: 'deadline',
    d: 'M16 3h5v5M21 3l-7 7M8 21H3v-5M3 21l7-7',
  },
  {
    id: 'league', label: 'Table', to: '/league',
    d: 'M3 3v18h18M18 9l-5 5-3-3-4 4',
  },
  {
    id: 'scouting', label: 'Scouting', to: '/scouting',
    d: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35',
  },
  {
    id: 'media', label: 'Press', to: '/media',
    d: 'M4 5h13v14H4zM17 9h3v8a2 2 0 01-3 0zM7 8h7M7 12h7M7 16h4',
  },
  {
    id: 'board', label: 'Boardroom', to: '/board',
    d: 'M3 21h18M5 21V9l7-5 7 5v12M10 21v-5h4v5',
  },
  {
    id: 'finance', label: 'Finance', to: '/finance',
    d: 'M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
  },
  {
    id: 'stadium', label: 'Ground', to: '/stadium',
    d: 'M2 8h20v10H2zM2 8l4-4h12l4 4M8 18v-6h8v6',
  },
  {
    id: 'academy', label: 'Academy', to: '/academy',
    d: 'M12 3L2 8l10 5 10-5zM6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5',
  },
  {
    id: 'staff', label: 'Staff', to: '/staff',
    d: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2',
    extra: 'M9 3a4 4 0 100 8 4 4 0 000-8zM19 8v6M22 11h-6',
  },
  {
    id: 'career', label: 'Career', to: '/career', badge: 'milestones',
    d: 'M6 3h12v7a6 6 0 01-12 0zM6 5H3v2a3 3 0 003 3M18 5h3v2a3 3 0 01-3 3M9 21h6M12 16v5',
  },
  {
    id: 'settings', label: 'Settings', to: '/settings',
    d: 'M12 15a3 3 0 100-6 3 3 0 000 6z',
    extra: 'M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H2a2 2 0 110-4h.09A1.65 1.65 0 004.6 8a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 3.68 1.65 1.65 0 0010 2.17V2a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H22a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z',
  },
]
