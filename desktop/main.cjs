/**
 * The desktop shell.
 *
 * Steam ships executables, and this game is a static bundle, so something has
 * to hold it. Electron rather than Tauri, and the reason is not size: Tauri's
 * binary is a tenth of this one but it renders in whatever webview the
 * operating system provides, which on Linux is WebKitGTK and on Windows is
 * WebView2. This game is typography and hairlines. Testing it against three
 * renderers to save a hundred megabytes on a storefront where a hundred
 * megabytes is nothing would be paying in the only currency that matters here.
 *
 * Electron ships the Chromium the game is already tested against, and a
 * Windows build of it runs on a Steam Deck under Proton without special
 * handling.
 *
 * Nothing in `src/` knows this file exists. The bundle is built with
 * `base: './'` so it loads from disk unchanged, saves are in IndexedDB which
 * the renderer provides, and the desktop layout is the same breakpoint a wide
 * browser window gets.
 */
const { app, BrowserWindow, shell } = require('electron')
const path = require('node:path')

/**
 * 1280x800 is the Steam Deck's screen, and it is the size worth defaulting to
 * even on a desktop: it is the one resolution the game is guaranteed to be
 * judged at if it is ever put in front of Valve.
 */
const DEFAULT_SIZE = { width: 1280, height: 800 }

/**
 * Narrow enough to reach the phone layout deliberately.
 *
 * The temptation is to set the minimum at the 900px breakpoint so the desktop
 * arrangement can never come apart. That would be wrong: the phone layout is
 * not a degraded version of this one, it is the design, and somebody who wants
 * the game in a narrow column beside their work should be allowed it.
 */
const MIN_SIZE = { width: 420, height: 640 }

function createWindow() {
  const win = new BrowserWindow({
    ...DEFAULT_SIZE,
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    // The app paints its own near-black ground. Without this the window is
    // white until the first frame, which reads as a flash on every launch.
    backgroundColor: '#08090b',
    show: false,
    autoHideMenuBar: true,
    title: 'Undisclosed Football',
    webPreferences: {
      // The renderer is a game with no server and no reason to touch the
      // filesystem or the network. It gets no Node at all.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })

  // Shown once there is something to look at, rather than as an empty frame
  // that fills in a moment later.
  win.once('ready-to-show', () => win.show())

  /**
   * Links leave the game rather than replacing it.
   *
   * A challenge link or the public site opened in this window would navigate
   * away from a career in progress, with no address bar and no way back. They
   * go to the real browser instead, and anything that is not an ordinary web
   * link is refused rather than followed.
   */
  const openExternally = (url) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  }
  win.webContents.setWindowOpenHandler(({ url }) => openExternally(url))
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) {
      event.preventDefault()
      openExternally(url)
    }
  })

  void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

// One window. A second instance of a game whose saves are per-profile would be
// two careers writing to the same database.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  void app.whenReady().then(() => {
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

// macOS keeps an app running with no windows; everywhere else, closing the
// last window is quitting.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
