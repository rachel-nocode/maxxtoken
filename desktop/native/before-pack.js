const { execFileSync } = require('child_process')
const path = require('path')

module.exports = async function beforePack(context) {
  if (context.electronPlatformName !== 'darwin') return
  if (process.platform !== 'darwin') throw new Error('Build the macOS capture detector on a Mac before packaging.')
  execFileSync('/bin/sh', [path.join(__dirname, 'build-screen-capture-probe.sh')], { stdio: 'inherit' })
}
