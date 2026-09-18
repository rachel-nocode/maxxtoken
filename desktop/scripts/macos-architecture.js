const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const MACH_MAGICS = new Set([
  'feedface', 'cefaedfe', 'feedfacf', 'cffaedfe',
  'cafebabe', 'bebafeca', 'cafebabf', 'bfbafeca',
])

function assertBundleArchitectures(directory, required = ['arm64', 'x86_64'], exec = execFileSync) {
  const checked = []
  function visit(folder) {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name)
      if (entry.isDirectory()) {
        visit(file)
      } else if (entry.isFile()) {
        const header = Buffer.alloc(4)
        const fd = fs.openSync(file, 'r')
        try {
          fs.readSync(fd, header, 0, 4, 0)
        } finally {
          fs.closeSync(fd)
        }
        if (!MACH_MAGICS.has(header.toString('hex'))) continue
        const architectures = exec('/usr/bin/lipo', ['-archs', file], { encoding: 'utf8' }).trim().split(/\s+/)
        if (required.some(arch => !architectures.includes(arch))) {
          throw new Error(`${file} requires ${required.join(' and ')}; found ${architectures.join(', ')}`)
        }
        checked.push(file)
      }
    }
  }
  visit(directory)
  if (!checked.length) throw new Error(`No Mach-O components found in ${directory}`)
  return checked
}

function probeArchitectures(hostArch, includeRosetta = false) {
  if (hostArch === 'arm64') return includeRosetta ? ['arm64', 'x86_64'] : ['arm64']
  if (hostArch === 'x64') return ['x86_64']
  throw new Error(`Unsupported macOS validation architecture: ${hostArch}`)
}

module.exports = { assertBundleArchitectures, probeArchitectures }
