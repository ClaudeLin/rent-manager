import { copyFileSync, cpSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'astro/config'
import { loadEnv } from 'vite'

const env = loadEnv(process.env.NODE_ENV ?? 'development', process.cwd(), '')
const configuredPath = env.PUBLIC_APP_PATH === undefined ? '/practice' : env.PUBLIC_APP_PATH
const pathSegments = configuredPath.split('/').filter(Boolean)

if (
  pathSegments.length === 0
  || pathSegments.some((segment) => !/^[A-Za-z0-9_-]+$/.test(segment))
  || ['_astro', 'data'].includes(pathSegments[0])
) {
  throw new Error('PUBLIC_APP_PATH must be a non-root path containing only letters, numbers, hyphens, or underscores')
}

const appPath = `/${pathSegments.join('/')}`

const scopedRuntimeAssets = {
  name: 'scoped-runtime-assets',
  hooks: {
    'astro:build:done': ({ dir }) => {
      const outputDirectory = fileURLToPath(dir)
      const scopedDirectory = join(outputDirectory, ...pathSegments)
      mkdirSync(scopedDirectory, { recursive: true })
      const indexSource = join(outputDirectory, 'index.html')
      if (existsSync(indexSource)) copyFileSync(indexSource, join(scopedDirectory, 'index.html'))
      for (const assetDirectory of ['_astro', 'data']) {
        const source = join(outputDirectory, assetDirectory)
        if (existsSync(source)) cpSync(source, join(scopedDirectory, assetDirectory), { recursive: true, force: true })
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
