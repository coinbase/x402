import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, GetCoreSchemaHandler
from pydantic.alias_generators import to_camel
from pydantic_core import core_schema

Version = Literal[1, 2]


# Ensures that the network string will have the correct format on Pydantic models
class Network(str):
    RE = re.compile(r"^[^:]+:[^:]+$")

    @classmethod
    def __get_pydantic_core_schema__(cls, _source_type, _handler: GetCoreSchemaHandler):
        return core_schema.no_info_after_validator_function(
            cls.validate,
            core_schema.str_schema(),
        )

    @classmethod
    def validate(cls, value, *args):
        if not isinstance(value, str):
            raise TypeError("Network must be a string")

        if not cls.RE.match(value):
            raise ValueError(
                "Network must be in '<left>:<right>' format (e.g., 'eth:mainnet')"
            )

        return cls(value)


class BaseCompoundType(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )
