import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))

const requiredFiles = [
  'lib/index.js',
  'lib/client.js',
  'lib/types/index.d.ts',
  'lib/types/client/index.d.ts',
  'cordis.patch.yml',
  'LICENSE',
]

await Promise.all(requiredFiles.map(file => access(resolve(root, file))))

if (packageJson.dsh?.bundle?.patch !== './cordis.patch.yml') {
  throw new Error('package.json must expose dsh.bundle.patch')
}
if (packageJson.exports?.['./client']?.default !== './lib/client.js') {
  throw new Error('package.json must export the browser entry')
}
if (!packageJson.files?.includes('LICENSE')) {
  throw new Error('package.json files must include LICENSE')
}
if (packageJson.files?.some(file => file.endsWith('.map'))) {
  throw new Error('published files must not include source maps')
}

const client = await readFile(resolve(root, 'lib/client.js'), 'utf8')
if (!client.includes('window.__ModuleLoader__.load')) {
  throw new Error('lib/client.js is not wrapped as a DSH browser module')
}
if (!client.includes('dsh-chat-fold')) {
  throw new Error('lib/client.js does not contain the plugin module id')
}

for (const file of ['tsconfig.json', 'tsdown.config.ts', 'lib/client.js']) {
  const source = await readFile(resolve(root, file), 'utf8')
  if (source.includes('/Users/') || source.includes('\\Users\\')) {
    throw new Error(`${file} contains a machine-specific absolute path`)
  }
}

console.log(`verified ${packageJson.name}@${packageJson.version}`)
