const ALL_WORKSPACES_OPTIONS = Object.freeze({
  visibleOnFullScreen: true,
  skipTransformProcessType: true,
})

function popoverWindowOptions(platform, preload, { width = 420, height = 720 } = {}) {
  return {
    width,
    height,
    show: false,
    frame: false,
    resizable: false,
    transparent: true,
    hasShadow: true,
    fullscreenable: false,
    skipTaskbar: true,
    ...(platform === 'darwin' ? { type: 'panel' } : {}),
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
    },
  }
}

function configurePopoverWindow(window) {
  window.setAlwaysOnTop(true, 'pop-up-menu')
  window.setVisibleOnAllWorkspaces(true, ALL_WORKSPACES_OPTIONS)
}

function presentPopoverWindow(window) {
  configurePopoverWindow(window)
  window.show()
  window.moveTop()
  window.focus()
}

module.exports = {
  ALL_WORKSPACES_OPTIONS,
  configurePopoverWindow,
  popoverWindowOptions,
  presentPopoverWindow,
}
