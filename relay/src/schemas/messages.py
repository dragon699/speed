from typing import Annotated, Literal
from pydantic import BaseModel, Field, TypeAdapter



class MessageHello(BaseModel):
    type: Literal['hello']
    key: str


class MessagePing(BaseModel):
    type: Literal['ping']
    t: float


class MessagePhone(BaseModel):
    type: Literal['phone']
    charging: bool
    name: str | None = Field(default=None, max_length=40)


ControlMessage = TypeAdapter(
    Annotated[MessagePing | MessagePhone, Field(discriminator='type')]
)
