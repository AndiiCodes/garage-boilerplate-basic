import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { useCollection } from '@/hooks/useFirestore'

/**
 * Regression tests for the live-subscription contract.
 *
 * `collection()` and `where()` allocate a new object on every render, so a naive
 * dependency array makes the effect re-subscribe on every render. A listener that
 * short-lived never survives a server round trip — it only ever replays Firestore's
 * local cache, so server-side writes (e.g. from a Server Action using the Admin SDK)
 * never show up until a full page reload.
 */

interface FakeQuery {
  path: string
  uid: string
}

const subscribes: FakeQuery[] = []
let unsubscribeCount = 0

vi.mock('firebase/firestore', () => ({
  onSnapshot: (q: FakeQuery, onNext: (snap: { docs: [] }) => void) => {
    subscribes.push(q)
    // The real SDK delivers the cached result asynchronously.
    setTimeout(() => onNext({ docs: [] }), 0)
    return () => {
      unsubscribeCount += 1
    }
  },
  query: (ref: { path: string }, constraint?: { uid: string }): FakeQuery => ({
    path: ref.path,
    uid: constraint?.uid ?? '',
  }),
  queryEqual: (a: FakeQuery, b: FakeQuery) => a.path === b.path && a.uid === b.uid,
}))

// Mirrors getNotesCollection(): a NEW object every call, exactly like Firestore's collection().
function freshCollectionRef() {
  return { path: 'notes' } as never
}

function Probe({ uid }: { uid: string }) {
  const { data } = useCollection(freshCollectionRef(), { uid } as never)
  return <div>{data.length}</div>
}

describe('useCollection', () => {
  beforeEach(() => {
    subscribes.length = 0
    unsubscribeCount = 0
  })

  it('subscribes once and does not churn across renders', async () => {
    render(<Probe uid="user-1" />)

    await waitFor(() => expect(subscribes.length).toBeGreaterThan(0))
    // Give any resubscribe loop room to run.
    await new Promise((resolve) => setTimeout(resolve, 250))

    expect(subscribes).toHaveLength(1)
    expect(unsubscribeCount).toBe(0)
  })

  it('re-subscribes when the query actually changes (uid resolves after auth)', async () => {
    // AuthProvider starts with user === null, so the first query filters on an empty uid.
    const { rerender } = render(<Probe uid="" />)
    await waitFor(() => expect(subscribes).toHaveLength(1))
    expect(subscribes[0]?.uid).toBe('')

    // Auth resolves — the listener must follow the new uid, not stay stuck on ''.
    rerender(<Probe uid="user-1" />)

    await waitFor(() => expect(subscribes).toHaveLength(2))
    expect(subscribes[1]?.uid).toBe('user-1')
    expect(unsubscribeCount).toBe(1)
  })
})
