// loadPipeline — require index.js with firebase-admin swapped for the fake.
//
// index.js calls admin.initializeApp() and admin.firestore() at module load,
// so the stub has to be in the require cache BEFORE index.js is required.
// Node's require cache is keyed by resolved path, so we seed it directly.
//
// Everything the pipeline reaches for outside Firestore is neutralized and
// RECORDED rather than silently dropped: pushes and GroupMe DMs land in
// arrays the tests assert on, so "did the right person get told" is a
// testable property and not a guess.

const Module = require('node:module')
const path = require('node:path')
const { FakeFirestore, FakeTimestamp, FieldValue } = require('./fakeFirestore')

const FUNCTIONS_DIR = path.join(__dirname, '..')

function stubModule(request, exports) {
  const resolved = Module._resolveFilename(request, {
    id: path.join(FUNCTIONS_DIR, 'index.js'),
    filename: path.join(FUNCTIONS_DIR, 'index.js'),
    paths: Module._nodeModulePaths(FUNCTIONS_DIR),
  })
  require.cache[resolved] = new Module(resolved, null)
  require.cache[resolved].filename = resolved
  require.cache[resolved].loaded = true
  require.cache[resolved].exports = exports
  return resolved
}

/**
 * Load a fresh copy of the pipeline over `seed` data.
 * Returns { db, pipeline, sent } where `sent` collects outbound messages.
 */
function loadPipeline(seed = {}) {
  const db = new FakeFirestore(seed)
  const sent = { push: [], groupme: [] }

  const stubbed = []

  const adminStub = {
    initializeApp: () => ({}),
    firestore: Object.assign(() => db, {
      FieldValue,
      Timestamp: FakeTimestamp,
    }),
    messaging: () => ({
      send: async (msg) => {
        sent.push.push(msg)
        return 'fake-message-id'
      },
    }),
  }

  // The v2 wrappers just return the handler config; the tests call the
  // extracted handlers directly, so these only need to not explode.
  const passthrough = (_opts, handler) => handler ?? _opts
  stubbed.push(stubModule('firebase-admin', adminStub))
  stubbed.push(stubModule('firebase-functions/v2/firestore', { onDocumentWritten: passthrough }))
  stubbed.push(stubModule('firebase-functions/v2/https', {
    onRequest: passthrough,
    onCall: passthrough,
    HttpsError: class HttpsError extends Error {
      constructor(code, message) { super(message); this.code = code }
    },
  }))
  stubbed.push(stubModule('firebase-functions/v2/scheduler', { onSchedule: passthrough }))
  stubbed.push(stubModule('firebase-functions/params', {
    // GROUPME_TOKEN gets a dummy value so the DM path actually executes and
    // its routing is testable; every other secret stays empty. Nothing
    // reaches api.groupme.com regardless — fetch is stubbed below.
    defineSecret: (name) => ({
      value: () => (name === 'GROUPME_TOKEN' ? 'test-token' : ''),
      name,
    }),
  }))
  stubbed.push(stubModule('googleapis', { google: { auth: { OAuth2: class {} }, gmail: () => ({}) } }))

  // Record GroupMe traffic instead of sending it.
  //
  // This stub must stay installed for the LIFETIME of the returned pipeline,
  // not just while index.js is being required — the DMs are sent when a
  // handler runs, long after load. Restoring it here (as an earlier version
  // did) meant the tests were quietly making real network calls to
  // api.groupme.com and recording nothing. Each loadPipeline installs a
  // fresh stub bound to its own `sent`; tests in a file run sequentially,
  // so the last one loaded is always the one under test.
  globalThis.fetch = async (url, opts) => {
    sent.groupme.push({ url: String(url), body: opts?.body })
    return { ok: true, status: 200, text: async () => '' }
  }

  const indexPath = require.resolve(path.join(FUNCTIONS_DIR, 'index.js'))
  delete require.cache[indexPath]
  const mod = require(indexPath)

  // Leave the module cache as we found it, so suites can't leak into each
  // other. fetch stays stubbed on purpose — see above.
  delete require.cache[indexPath]
  for (const r of stubbed) delete require.cache[r]

  return { db, pipeline: mod.__test__, sent, Timestamp: FakeTimestamp }
}

module.exports = { loadPipeline }
