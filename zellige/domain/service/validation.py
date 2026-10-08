from zellige.domain.exception.domain_error import InvalidError


def require_names(*values: object) -> None:
    if not all(isinstance(value, str) and value for value in values):
        raise InvalidError("invalid_request", "fields must be non-empty strings")
