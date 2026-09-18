const test = require('node:test')
const assert = require('node:assert/strict')

const {
  ALL_WORKSPACES_OPTIONS,
  configurePopoverWindow,
  popoverWindowOptions,
  presentPopoverWindow,
} = require('../lib/popover-window')

test('macOS popover uses a panel so showing and focusing it does not activate another Space', () => {
  const options = popoverWindowOptions('darwin', '/tmp/preload.js', { width: 421, height: 711 })

  assert.equal(options.type, 'panel')
  assert.equal(options.width, 421)
  assert.equal(options.height, 711)
  assert.equal(options.show, false)
  assert.equal(options.fullscreenable, false)
  assert.equal(options.webPreferences.preload, '/tmp/preload.js')
})

test('non-macOS popover retains the normal BrowserWindow type', () => {
  const options = popoverWindowOptions('win32', 'C:\\preload.js')

  assert.equal(Object.hasOwn(options, 'type'), false)
})

test('popover is made available on every Space before it is shown and focused', () => {
  const calls = []
  const window = {
    setAlwaysOnTop: (...args) => calls.push(['setAlwaysOnTop', ...args]),
    setVisibleOnAllWorkspaces: (...args) => calls.push(['setVisibleOnAllWorkspaces', ...args]),
    show: () => calls.push(['show']),
    moveTop: () => calls.push(['moveTop']),
    focus: () => calls.push(['focus']),
  }

  presentPopoverWindow(window)

  assert.deepEqual(calls, [
    ['setAlwaysOnTop', true, 'pop-up-menu'],
    ['setVisibleOnAllWorkspaces', true, ALL_WORKSPACES_OPTIONS],
    ['show'],
    ['moveTop'],
    ['focus'],
  ])
})

test('initial popover configuration preserves fullscreen visibility', () => {
  const calls = []
  configurePopoverWindow({
    setAlwaysOnTop: (...args) => calls.push(['setAlwaysOnTop', ...args]),
    setVisibleOnAllWorkspaces: (...args) => calls.push(['setVisibleOnAllWorkspaces', ...args]),
  })

  assert.deepEqual(calls[1], ['setVisibleOnAllWorkspaces', true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: true,
  }])
})
