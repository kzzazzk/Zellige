import time


class SystemClock:
    def __call__(self) -> int:
        return time.time_ns() // 1_000
