import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'

await rm(resolve(import.meta.dirname, '..', 'lib'), { recursive: true, force: true })
