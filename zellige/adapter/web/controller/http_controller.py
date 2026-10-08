from dataclasses import dataclass, field

from fastapi import APIRouter


@dataclass
class HTTPController:
    router: APIRouter = field(default_factory=APIRouter, init=False)
