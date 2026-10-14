import { collection, deleteDoc, deleteField, doc, FieldPath, onSnapshot, setDoc, updateDoc, writeBatch } from 'firebase/firestore'
import { db } from './firebase'

export type CollectionName = 'items' | 'salesWeeks' | 'counts' | 'orders' | 'scheduleChanges' | 'holidaySettings' | 'events' | 'promos'
type Doc = Record<string, unknown>

/**
 * Minimal document store. Uses Firestore when it's configured (shared between the phone and the
 * computer); otherwise falls back to this browser's localStorage so the app still works for a
 * single-device trial before Firebase is set up.
 */
interface Store {
  subscribe(name: CollectionName, callback: (docs: Doc[]) => void): () => void
  put(name: CollectionName, id: string, data: Doc): Promise<void>
  /** Deep-merges nested objects (e.g. one entry into a count's `entries` map) without touching siblings. */
  merge(name: CollectionName, id: string, data: Doc): Promise<void>
  putMany(name: CollectionName, docs: { id: string; data: Doc }[]): Promise<void>
  remove(name: CollectionName, id: string): Promise<void>
  /** Removes one nested field (e.g. a holiday setting) so the value falls back to its default. */
  clearField(name: CollectionName, id: string, path: string[]): Promise<void>
}

const firestoreStore = (firestore: NonNullable<typeof db>): Store => ({
  subscribe: (name, callback) => onSnapshot(collection(firestore, name), snapshot => callback(snapshot.docs.map(d => d.data()))),
  put: (name, id, data) => setDoc(doc(firestore, name, id), data),
  merge: (name, id, data) => setDoc(doc(firestore, name, id), data, { merge: true }),
  putMany: async (name, docs) => {
    for (let start = 0; start < docs.length; start += 450) {
      const batch = writeBatch(firestore)
      docs.slice(start, start + 450).forEach(({ id, data }) => batch.set(doc(firestore, name, id), data))
      await batch.commit()
    }
  },
  remove: (name, id) => deleteDoc(doc(firestore, name, id)),
  // FieldPath, not a dotted string: holiday offsets like "-2" aren't valid in dotted paths.
  clearField: (name, id, path) => updateDoc(doc(firestore, name, id), new FieldPath(...path), deleteField()).catch(() => undefined),
})

function deepMerge(target: Doc, source: Doc): Doc {
  const result: Doc = { ...target }
  for (const [key, value] of Object.entries(source)) {
    const existing = result[key]
    result[key] = value && typeof value === 'object' && !Array.isArray(value) && existing && typeof existing === 'object' && !Array.isArray(existing)
      ? deepMerge(existing as Doc, value as Doc)
      : value
  }
  return result
}

function localStore(): Store {
  const key = (name: CollectionName) => `milk-order:${name}`
  const listeners = new Map<CollectionName, Set<(docs: Doc[]) => void>>()
  const read = (name: CollectionName): Record<string, Doc> => {
    try { return JSON.parse(localStorage.getItem(key(name)) ?? '{}') } catch { return {} }
  }
  const emit = (name: CollectionName) => listeners.get(name)?.forEach(callback => callback(Object.values(read(name))))
  const write = (name: CollectionName, update: (docs: Record<string, Doc>) => void) => {
    const docs = read(name)
    update(docs)
    localStorage.setItem(key(name), JSON.stringify(docs))
    emit(name)
  }
  window.addEventListener('storage', event => {
    const name = event.key?.replace('milk-order:', '') as CollectionName | undefined
    if (name && listeners.has(name)) emit(name)
  })
  return {
    subscribe: (name, callback) => {
      if (!listeners.has(name)) listeners.set(name, new Set())
      listeners.get(name)!.add(callback)
      queueMicrotask(() => callback(Object.values(read(name))))
      return () => { listeners.get(name)!.delete(callback) }
    },
    put: async (name, id, data) => write(name, docs => { docs[id] = data }),
    merge: async (name, id, data) => write(name, docs => { docs[id] = deepMerge(docs[id] ?? {}, data) }),
    putMany: async (name, list) => write(name, docs => { list.forEach(({ id, data }) => { docs[id] = data }) }),
    remove: async (name, id) => write(name, docs => { delete docs[id] }),
    clearField: async (name, id, path) => write(name, docs => {
      let target = docs[id] as Doc | undefined
      for (const key of path.slice(0, -1)) target = target?.[key] as Doc | undefined
      if (target) delete target[path[path.length - 1]]
    }),
  }
}

export const store: Store = db ? firestoreStore(db) : localStore()
export const usingLocalStorage = !db
