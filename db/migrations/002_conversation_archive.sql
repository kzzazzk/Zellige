-- Archiving affects navigation only; canonical history remains readable.
ALTER TABLE conversations ADD COLUMN archived_at INTEGER;
CREATE INDEX idx_conversations_inbox
    ON conversations(deleted_at, archived_at, updated_at DESC, id);
