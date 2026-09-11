from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class SensoryInput(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    odor_left: float = Field(0, ge=0, le=1)
    odor_right: float = Field(0, ge=0, le=1)
    light_left: float = Field(0.5, ge=0, le=1)
    light_right: float = Field(0.5, ge=0, le=1)
    heat: float = Field(0, ge=0, le=1)
    cold: float = Field(0, ge=0, le=1)
    taste: float = Field(0, ge=0, le=1)


class StepRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    sensors: SensoryInput = Field(default_factory=SensoryInput)
    running: bool = True
    silenced: bool = False
    gain: float = Field(1.0, ge=0, le=2)
    command: Literal['step', 'reset'] = 'step'


class MotorOutput(BaseModel):
    forward: float
    turn: float
    lift: float
    feeding: float


class Telemetry(BaseModel):
    type: Literal['telemetry'] = 'telemetry'
    neural_ms: float
    spikes: int
    active_neurons: int
    mean_hz: float
    compute_ms: float
    motor_left_hz: float
    motor_right_hz: float
    motor: MotorOutput
    groups: dict[str, float]
    activity: list[dict]
    silenced: bool
