import uuid


class Identifiers:
    @staticmethod
    def new(prefix: str) -> str:
        return f"{prefix}_{uuid.uuid4().hex}"
