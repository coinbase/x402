#!/usr/bin/env node
/**
 * Verifies that every `"types"` condition target in every workspace package's
 * `package.json` `"exports"` map actually exists on disk, post-build.
 *
 * This is a safety net for build-config changes like `mirror-cjs-dts.mjs`
 * (typescript/scripts/mirror-cjs-dts.mjs): a script or tsup config mistake there could
 * leave a declared `.d.ts`/`.d.cts` target missing while the build itself still exits 0,
 * silently shipping a package that resolves at runtime but has no types for some
 * subpath. Run this after building the workspace (e.g. `pnpm build && node
 * typescript/scripts/verify-package-exports.mjs` from `typescript/`).
 *
 * Scans every package under the directories in {@link PACKAGE_GLOBS}, including
 * `packages/legacy/*` (this only reads already-published-shape config; it does not
 * modify anything, so it's safe to run there too).
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const TYPESCRIPT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Directories (relative to the `typescript/` root) whose immediate subdirectories are packages. */
const PACKAGE_GLOBS = [
  'packages', // core, extensions, mcp themselves live directly here
  'packages/http',
  'packages/mechanisms',
  'packages/legacy',
]

/**
 * Lists directories directly under `dir` that contain a `package.json`.
 *
 * @param dir - Absolute directory to scan
 * @returns Absolute paths of immediate child directories containing a `package.json`
 */
function listPackageDirs(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .map((entry) => join(dir, entry))
    .filter((full) => statSync(full).isDirectory() && existsSync(join(full, 'package.json')))
}

/**
 * Recursively collects every string value found under an `"exports"` map's `"types"`
 * keys, at any nesting depth (subpaths, conditions, arrays of fallback conditions).
 *
 * @param node - Current `exports` subtree (object, array, or string)
 * @param inTypesKey - Whether `node` is itself the value of a `"types"` key
 * @param found - Accumulator (used for the recursive call; omit at the top level)
 * @returns Every `"types"` target string found in this subtree
 */
function collectTypesTargets(node, inTypesKey = false, found = []) {
  if (typeof node === 'string') {
    if (inTypesKey) found.push(node)
    return found
  }
  if (Array.isArray(node)) {
    for (const entry of node) collectTypesTargets(entry, inTypesKey, found)
    return found
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      collectTypesTargets(value, key === 'types', found)
    }
  }
  return found
}

/**
 * Verifies one package's `exports.*.types` targets exist on disk. Returns `null`
 * (skip) for a package with no `dist` directory at all: a scoped build (e.g. `turbo
 * run build --filter=site...`) only builds a subset of the workspace, so an unbuilt
 * sibling package here is expected, not a missing-types regression. A package that
 * turbo actually ran and that legitimately failed to produce output would already
 * have failed that build step with a non-zero exit before this script ever runs.
 *
 * @param packageDir - Absolute path to the package directory
 * @returns Missing target paths (relative to the package directory), or `null` if
 *   this package was skipped (not built in this run)
 */
function verifyPackage(packageDir) {
  const pkg = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
  if (!pkg.exports) return []
  if (!existsSync(join(packageDir, 'dist'))) return null

  const targets = collectTypesTargets(pkg.exports)
  return targets.filter((target) => !existsSync(join(packageDir, target)))
}

/**
 * Verifies every workspace package's `exports.*.types` targets.
 *
 * @returns Nothing; prints a report and exits 1 if any target is missing
 */
function main() {
  const packageDirs = PACKAGE_GLOBS.flatMap((glob) => listPackageDirs(join(TYPESCRIPT_ROOT, glob)))

  let checkedCount = 0
  let skippedCount = 0
  let missingCount = 0

  for (const packageDir of packageDirs) {
    const missing = verifyPackage(packageDir)
    if (missing === null) {
      skippedCount += 1
      continue
    }
    checkedCount += 1
    if (missing.length > 0) {
      missingCount += missing.length
      const name = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')).name
      for (const target of missing) {
        console.error(`[verify-package-exports] ${name}: missing "${target}" (declared in exports)`)
      }
    }
  }

  if (missingCount > 0) {
    console.error(
      `[verify-package-exports] ${missingCount} missing types target(s) across ${checkedCount} built package(s) (${skippedCount} unbuilt package(s) skipped).`,
    )
    process.exit(1)
  }

  console.log(
    `[verify-package-exports] All exports.*.types targets exist (${checkedCount} built package(s) checked, ${skippedCount} unbuilt package(s) skipped).`,
  )
}

main()
