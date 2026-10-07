class PersistenceConflict(Exception):
    """A repository constraint failed; infrastructure exceptions must not escape."""
