var App = App || {} // eslint-disable-line no-var -- shared namespace, no modules

// Catalogs between launches. A panel's movies run to tens of thousands of titles, far past
// what localStorage holds, so they go in IndexedDB. Anything that goes wrong here only means
// a slower start: every call settles and none throws. Without IndexedDB (jsdom, an engine
// that refuses it) the values live in memory for the session.
App.cache = (function () {
    const DB = "vexontv"
    const STORE = "catalogs"
    const memory = {}
    let opening = null

    function open() {
        if (opening) return opening
        opening = new Promise((resolve) => {
            if (typeof indexedDB === "undefined" || !indexedDB) {
                resolve(null)
                return
            }
            try {
                const request = indexedDB.open(DB, 1)
                request.onupgradeneeded = function () {
                    request.result.createObjectStore(STORE)
                }
                request.onsuccess = function () {
                    resolve(request.result)
                }
                request.onerror = function () {
                    resolve(null)
                }
                request.onblocked = function () {
                    resolve(null)
                }
            } catch {
                resolve(null)
            }
        })
        return opening
    }

    function run(mode, work) {
        return open().then((db) => {
            if (!db) return undefined
            return new Promise((resolve) => {
                try {
                    const tx = db.transaction(STORE, mode)
                    const request = work(tx.objectStore(STORE))
                    tx.oncomplete = function () {
                        resolve(request ? request.result : null)
                    }
                    tx.onerror = function () {
                        resolve(null)
                    }
                    tx.onabort = function () {
                        resolve(null)
                    }
                } catch {
                    resolve(null)
                }
            })
        })
    }

    function get(key) {
        return run("readonly", (store) => {
            return store.get(key)
        }).then((value) => {
            if (value === undefined) return memory[key] || null
            return value || null
        })
    }

    function set(key, value) {
        return run("readwrite", (store) => {
            return store.put(value, key)
        }).then((done) => {
            if (done === undefined) memory[key] = value
            return true
        })
    }

    function remove(key) {
        delete memory[key]
        return run("readwrite", (store) => {
            return store.delete(key)
        }).then(() => {
            return true
        })
    }

    return { get, set, remove }
})()
