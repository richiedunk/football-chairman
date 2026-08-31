import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

/**
 * Hash history, deliberately.
 *
 * A Capacitor build is served from `file://` (or a custom scheme), where the
 * History API has no server to fall back on and a deep link to `/squad` is a
 * 404. Hash routing survives that unchanged, and costs nothing on the web.
 */
const routes: RouteRecordRaw[] = [
  { path: '/', name: 'start', component: () => import('./ui/views/StartView.vue') },
  { path: '/new', name: 'new-game', component: () => import('./ui/views/NewGameView.vue') },
  { path: '/new/club', name: 'club-select', component: () => import('./ui/views/ClubSelectView.vue') },

  { path: '/welcome', name: 'welcome', component: () => import('./ui/views/WelcomeView.vue') },
  { path: '/looking', name: 'looking', component: () => import('./ui/views/JobSearchView.vue') },

  /*
   * Five tabs: home, squad, transfers, inbox, league. Everything else hangs
   * off the home dashboard rather than off the bar — finance, facilities, the
   * board, staff, the academy, the media, the career record. Fewer top-level
   * places with a deeper drill-down is what stops a phone screen reading as a
   * menu, so those routes carry `tab: 'home'` and keep the first tab lit.
   */
  { path: '/home', name: 'home', component: () => import('./ui/views/HomeView.vue'), meta: { tab: 'home' } },
  { path: '/inbox', name: 'inbox', component: () => import('./ui/views/InboxView.vue'), meta: { tab: 'inbox' } },
  { path: '/squad', name: 'squad', component: () => import('./ui/views/SquadView.vue'), meta: { tab: 'squad' } },
  { path: '/registration', name: 'registration', component: () => import('./ui/views/RegistrationView.vue'), meta: { tab: 'squad' } },
  { path: '/player/:id', name: 'player', component: () => import('./ui/views/PlayerView.vue'), meta: { tab: 'squad' } },
  { path: '/transfers', name: 'transfers', component: () => import('./ui/views/TransfersView.vue'), meta: { tab: 'transfers' } },
  { path: '/deadline', name: 'deadline', component: () => import('./ui/views/DeadlineView.vue'), meta: { tab: 'transfers' } },
  { path: '/agents', name: 'agents', component: () => import('./ui/views/AgentsView.vue'), meta: { tab: 'transfers' } },
  { path: '/scouting', name: 'scouting', component: () => import('./ui/views/ScoutingView.vue'), meta: { tab: 'transfers' } },
  { path: '/search', name: 'search', component: () => import('./ui/views/SearchView.vue'), meta: { tab: 'transfers' } },
  { path: '/club', name: 'club', component: () => import('./ui/views/ClubView.vue'), meta: { tab: 'home' } },
  { path: '/finance', name: 'finance', component: () => import('./ui/views/FinanceView.vue'), meta: { tab: 'home' } },
  { path: '/facilities', name: 'facilities', component: () => import('./ui/views/FacilitiesView.vue'), meta: { tab: 'home' } },
  { path: '/stadium', name: 'stadium', component: () => import('./ui/views/StadiumView.vue'), meta: { tab: 'home' } },
  { path: '/staff', name: 'staff', component: () => import('./ui/views/StaffView.vue'), meta: { tab: 'home' } },
  { path: '/academy', name: 'academy', component: () => import('./ui/views/AcademyView.vue'), meta: { tab: 'home' } },
  { path: '/board', name: 'board', component: () => import('./ui/views/BoardView.vue'), meta: { tab: 'home' } },
  { path: '/media', name: 'media', component: () => import('./ui/views/MediaView.vue'), meta: { tab: 'home' } },
  { path: '/match/:id', name: 'match', component: () => import('./ui/views/MatchView.vue'), meta: { tab: 'home' } },
  { path: '/league', name: 'league', component: () => import('./ui/views/LeagueView.vue'), meta: { tab: 'league' } },
  { path: '/league/:id', name: 'league-detail', component: () => import('./ui/views/LeagueView.vue'), meta: { tab: 'league', title: 'League table' } },
  { path: '/career', name: 'career', component: () => import('./ui/views/CareerView.vue'), meta: { tab: 'home' } },
  { path: '/achievements', name: 'achievements', component: () => import('./ui/views/AchievementsView.vue'), meta: { tab: 'home' } },
  { path: '/about', name: 'about', component: () => import('./ui/views/AboutView.vue'), meta: { tab: 'home' } },
  { path: '/settings', name: 'settings', component: () => import('./ui/views/SettingsView.vue'), meta: { tab: 'home' } },
  // An unknown path lands on the dashboard when a career is loaded, and on the
  // title screen only when there is nothing to go back to. Sending someone
  // mid-career to "Start a new career" because a link was malformed looks
  // exactly like having lost the save.
  {
    path: '/:pathMatch(.*)*',
    // Named so that resolveLink() can tell a real destination from this one:
    // router.resolve() does not fail on an unknown path, it matches the
    // catch-all, and without a name there is nothing to test.
    name: 'not-found',
    meta: { title: 'Wrong turnstile' },
    component: () => import('./ui/views/NotFoundView.vue'),
  },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
  // No scrollBehavior: the window never scrolls in this app, `.content` does,
  // so resetting the window's position achieved nothing. App.vue scrolls the
  // real container on every route change.
})
