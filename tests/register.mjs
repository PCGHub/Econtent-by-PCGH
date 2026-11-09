import { registerHooks } from 'node:module'
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'server-only') return { url: 'data:text/javascript,export {}', shortCircuit: true }
  try { return nextResolve(specifier, context) }
  catch (error) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return nextResolve(`${specifier}.ts`, context)
    throw error
  }
} })
