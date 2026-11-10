from typing import Annotated, Any, Literal
from pydantic import BaseModel, Field, TypeAdapter



class MessageHello(BaseModel):
    type: Literal['hello']
    key: str | None = None


class MessagePing(BaseModel):
    type: Literal['ping']
    t: float


class MessagePhone(BaseModel):
    type: Literal['phone']
    charging: bool
    name: str | None = Field(default=None, max_length=40)


class MessageRecord(BaseModel):
    type: Literal['record']
    on: bool


class MessageSignal(BaseModel):
    type: Literal['signal']
    data: dict[str, Any]


ControlMessage = TypeAdapter(
    Annotated[MessagePing | MessagePhone | MessageRecord | MessageSignal, Field(discriminator='type')]
)
