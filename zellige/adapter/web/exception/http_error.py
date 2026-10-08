class HTTPError(Exception):
    """Failures that only exist at the HTTP edge: authentication and body limits."""

    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message
