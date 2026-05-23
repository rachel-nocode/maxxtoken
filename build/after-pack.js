const { execFileSync } = require('child_process')
const path = require('path')

const UNUSED_PRIVACY_KEYS = [
  'NSAudioCaptureUsageDescription',
  'NSBluetoothAlwaysUsageDescription',
  'NSBluetoothPeripheralUsageDescription',
  'NSCameraUsageDescription',
  'NSMicrophoneUsageDescription',
]

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appName = `${context.packager.appInfo.productFilename}.app`
  const plist = path.join(context.appOutDir, appName, 'Contents', 'Info.plist')

  for (const key of UNUSED_PRIVACY_KEYS) {
    try {
      execFileSync('/usr/libexec/PlistBuddy', ['-c', `Delete :${key}`, plist], { stdio: 'ignore' })
    } catch {
      /* Electron may omit some keys depending on version. */
    }
  }
}
