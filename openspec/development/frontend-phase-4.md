# Frontend Phase 4: Query cache ownership

Phase 4 builds directly on Phase 3B (`924919c`) and pins
`@tanstack/react-query` to `5.104.1`. Each App owns its QueryClient; direct hook
tests use `createQueryWrapper()` to create an isolated provider and inspect cache
state. No global client or persisted Query cache is used.

`workspaceKeys` identifies the aggregated conversation page by submitted archived
and search filters, the composed Thread by authoritative conversation/branch IDs,
and runtime profiles. Tokens never enter keys. Thread remains one domain value
assembled by `loadThread()`, including conversation, branches, history and runs.
Missing branch hints adopt the first authoritative branch without caching aliases.

`useWorkspaceServerState` subscribes to QueryCache through `useSyncExternalStore`
and adapts the existing setters to `setQueryData`. Cache values are the only
canonical server state; React retains filters and selection identity. Direct cache
subscriptions also observe removals immediately. They register no automatic
network reads. The client disables retries, mount/focus/reconnect refetch and
polling; entries remain available for the session until explicitly removed.

All reads and writes still use the synchronous operation gate and existing API
boundaries. Search stages a read before publishing to its new filter key;
load-more merges the explicit offset read into that filter's aggregated entry.
Manual refresh and route reads retain their existing ordering. Mutation results,
partial successes, conflict recovery and queued runs write the captured composed
thread; drafts, notices, profile selection and operation diagnostics remain local.
Query structural sharing is disabled so explicit authoritative refreshes replace
the canonical snapshot even when the server returns equal JSON, preserving the
existing snapshot replacement behavior.

Connection and bootstrap stage initial reads outside the cache. Successful
connection removes all prior workspace entries before committing the staged
default list and profiles and resetting selection. Failed reconnect never changes
the prior cache, token, selection or drafts. Bootstrap also stages restoration of
the saved branch before publishing for direct hooks; routed bootstrap keeps Phase
2's URL-driven restoration. Saved selection cannot be overwritten while bootstrap
or navigation is pending. Disconnect removes workspace cache entries, clears
selection and drafts, and retains the archived filter. Session storage still holds
only token, authoritative selection and cursor.

Phase 3B synchronization continues to drain changes and stage every required
authoritative read through direct API calls, outside QueryCache. Any failure leaves
all cached values and the cursor unchanged for replay. After all reads succeed,
setters synchronously commit the staged values, including the captured thread
even if route intent moved, then display changes and clear has-more, and finally
acknowledge the cursor. There is no invalidate/refetch publication during sync and
no use of `Change.data` as a DTO. Phase 2 continues to hide and resolve pending
route state, including the A → B → A regression.

No backend, generated OpenAPI, router or UI changes are part of this phase. Query
network orchestration, mutations, persistence and automatic synchronization remain
outside its scope.
