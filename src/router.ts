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

  { path: '/home', name: 'home', component: () => import('./ui/views/HomeView.vue'), meta: { tab: 'home' } },
  { path: '/inbox', name: 'inbox', component: () => import('./ui/views/InboxView.vue'), meta: { tab: 'inbox' } },
  { path: '/squad', name: 'squad', component: () => import('./ui/views/SquadView.vue'), meta: { tab: 'squad' } },
  { path: '/registration', name: 'registration', component: () => import('./ui/views/RegistrationView.vue'), meta: { tab: 'squad' } },
  { path: '/player/:id', name: 'player', component: () => import('./ui/views/PlayerView.vue'), meta: { tab: 'squad' } },
  { path: '/transfers', name: 'transfers', component: () => import('./ui/views/TransfersView.vue'), meta: { tab: 'transfers' } },
  { path: '/scouting', name: 'scouting', component: () => import('./ui/views/ScoutingView.vue'), meta: { tab: 'transfers' } },
  { path: '/search', name: 'search', component: () => import('./ui/views/SearchView.vue'), meta: { tab: 'transfers' } },
  { path: '/club', name: 'club', component: () => import('./ui/views/ClubView.vue'), meta: { tab: 'club' } },
  { path: '/finance', name: 'finance', component: () => import('./ui/views/FinanceView.vue'), meta: { tab: 'club' } },
  { path: '/facilities', name: 'facilities', component: () => import('./ui/views/FacilitiesView.vue'), meta: { tab: 'club' } },
  { path: '/stadium', name: 'stadium', component: () => import('./ui/views/StadiumView.vue'), meta: { tab: 'club' } },
  { path: '/staff', name: 'staff', component: () => import('./ui/views/StaffView.vue'), meta: { tab: 'club' } },
  { path: '/academy', name: 'academy', component: () => import('./ui/views/AcademyView.vue'), meta: { tab: 'club' } },
  { path: '/board', name: 'board', component: () => import('./ui/views/BoardView.vue'), meta: { tab: 'club' } },
  { path: '/media', name: 'media', component: () => import('./ui/views/MediaView.vue'), meta: { tab: 'club' } },
  { path: '/league', name: 'league', component: () => import('./ui/views/LeagueView.vue'), meta: { tab: 'league' } },
  { path: '/league/:id', name: 'league-detail', component: () => import('./ui/views/LeagueView.vue'), meta: { tab: 'league' } },
  { path: '/career', name: 'career', component: () => import('./ui/views/CareerView.vue'), meta: { tab: 'club' } },
  { path: '/achievements', name: 'achievements', component: () => import('./ui/views/AchievementsView.vue'), meta: { tab: 'club' } },
  { path: '/settings', name: 'settings', component: () => import('./ui/views/SettingsView.vue'), meta: { tab: 'club' } },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})
