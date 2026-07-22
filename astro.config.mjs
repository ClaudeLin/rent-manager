import { cpSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'astro/config'
import { loadEnv } from 'vite'

const env = loadEnv(process.env.NODE_ENV ?? 'development', process.cwd(), '')
const configuredPath = env.PUBLIC_APP_PATH ?? ''
const pathSegments = configuredPath.split('/').filter(Boolean)

if (
  pathSegments.some((segment) => !/^[A-Za-z0-9_-]+$/.test(segment))
  || ['_astro', 'data'].includes(pathSegments[0])
) {
  throw new Error('PUBLIC_APP_PATH must contain only letters, numbers, hyphens, or underscores')
}

const appPath = pathSegments.length ? `/${pathSegments.join('/')}` : '/'

const scopedRuntimeAssets = {
  name: 'scoped-runtime-assets',
  hooks: {
    'astro:build:done': ({ dir }) => {
      if (!pathSegments.length) return
      const outputDirectory = fileURLToPath(dir)
      const stagingDirectory = mkdtempSync(join(tmpdir(), 'rent-exam-build-'))
      const stagedSite = join(stagingDirectory, 'site')

      try {
        cpSync(outputDirectory, stagedSite, { recursive: true })
        rmSync(outputDirectory, { recursive: true, force: true })
        const scopedDirectory = join(outputDirectory, ...pathSegments)
        mkdirSync(scopedDirectory, { recursive: true })
        cpSync(stagedSite, scopedDirectory, { recursive: true })
      } finally {
        rmSync(stagingDirectory, { recursive: true, force: true })
      }
    },
  },
}

export default defineConfig({
  output: 'static',
  site: env.PUBLIC_SITE_ORIGIN || 'http://localhost:4321',
  base: appPath,
  integrations: [scopedRuntimeAssets],
})
