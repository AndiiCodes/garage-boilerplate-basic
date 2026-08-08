'use client'

import { useEffect, useState } from 'react'
import {
  onSnapshot,
  query,
  queryEqual,
  type CollectionReference,
  type DocumentData,
  type Query,
  type QueryConstraint,
} from 'firebase/firestore'

interface UseCollectionResult<T> {
  data: T[]
  loading: boolean
  error: Error | null
}

/**
 * Subscribe to a Firestore collection with real-time updates.
 *
 * @example
 * const { data, loading, error } = useCollection(usersCollection, where('role', '==', 'admin'))
 */
export function useCollection<T extends DocumentData>(
  collectionRef: CollectionReference<T>,
  ...queryConstraints: QueryConstraint[]
): UseCollectionResult<T> {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // `collection()` and the constraint factories (`where()`, `orderBy()`, ...) allocate a
  // new object on every render, so neither can be used as an effect dependency directly —
  // doing so tears down and re-subscribes the listener on every render, and a listener that
  // short-lived only ever reads Firestore's local cache (it never survives a server round
  // trip). Compare the *logical* query with `queryEqual` instead and hold the reference in
  // state, adjusting it during render only when the query genuinely changes — e.g. when the
  // signed-in uid resolves and `where('uid', '==', ...)` stops filtering on an empty string.
  const q: Query<T> =
    queryConstraints.length > 0 ? query(collectionRef, ...queryConstraints) : query(collectionRef)

  const [stableQuery, setStableQuery] = useState<Query<T>>(q)
  if (!queryEqual(stableQuery, q)) {
    setStableQuery(q)
    setLoading(true) // the previous query's results no longer apply
  }

  useEffect(() => {
    const unsubscribe = onSnapshot(
      stableQuery,
      (snapshot) => {
        setData(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as T[])
        setLoading(false)
      },
      (err) => {
        setError(err)
        setLoading(false)
      }
    )

    return () => unsubscribe()
  }, [stableQuery])

  return { data, loading, error }
}
