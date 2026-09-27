import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateFirebaseEnv } from './check-firebase-env.mjs'

// Shaped like a real one, and deliberately NOT a real one.
const KEY = 'AIzaSyB0000000000000000000000000000000x'
const APP = '1:876749980452:web:0123456789abcdef012345'

const ok = { VITE_FIREBASE_API_KEY: KEY, VITE_FIREBASE_APP_ID: APP }

test('a well-formed config passes', () => {
  assert.deepEqual(validateFirebaseEnv(ok), [])
  assert.equal(KEY.length, 39)
})

test('a missing secret is named, not guessed at', () => {
  assert.match(validateFirebaseEnv({ ...ok, VITE_FIREBASE_API_KEY: '' })[0], /API_KEY is empty/)
  assert.match(validateFirebaseEnv({ VITE_FIREBASE_API_KEY: KEY })[0], /APP_ID is empty/)
  assert.equal(validateFirebaseEnv({}).length, 2)
})

test('whitespace and quotes around a pasted value are caught', () => {
  assert.match(validateFirebaseEnv({ ...ok, VITE_FIREBASE_API_KEY: `${KEY}\n` })[0], /whitespace/)
  assert.match(validateFirebaseEnv({ ...ok, VITE_FIREBASE_API_KEY: ` ${KEY}` })[0], /whitespace/)
  assert.match(validateFirebaseEnv({ ...ok, VITE_FIREBASE_API_KEY: `"${KEY}"` })[0], /quotes/)
  assert.match(validateFirebaseEnv({ ...ok, VITE_FIREBASE_APP_ID: `${APP} ` })[0], /whitespace/)
})

test('a truncated or malformed key is caught', () => {
  assert.match(validateFirebaseEnv({ ...ok, VITE_FIREBASE_API_KEY: 'AIzaSyB123' })[0], /39 characters, got 10/)
  assert.match(validateFirebaseEnv({ ...ok, VITE_FIREBASE_API_KEY: 'not-a-key-at-all-at-all-at-all-at-all-x' })[0], /Google API key/)
})

test('an app id from another Firebase project is caught', () => {
  const other = '1:123456789012:web:0123456789abcdef012345'
  assert.match(validateFirebaseEnv({ ...ok, VITE_FIREBASE_APP_ID: other })[0], /different Firebase project/)
})

test('a malformed app id is caught before the project check', () => {
  assert.match(validateFirebaseEnv({ ...ok, VITE_FIREBASE_APP_ID: 'web-app-1' })[0], /shaped like a web app id/)
})

test('the two values swapped is reported as one clear problem', () => {
  // Otherwise it reads as two unrelated shape errors and the fix isn't obvious.
  const swapped = validateFirebaseEnv({ VITE_FIREBASE_API_KEY: APP, VITE_FIREBASE_APP_ID: KEY })
  assert.deepEqual(swapped, ['VITE_FIREBASE_API_KEY and VITE_FIREBASE_APP_ID are swapped.'])
})
