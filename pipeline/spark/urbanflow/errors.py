"""
Module 52 §2.4: the project-wide exception hierarchy.

One base type (`UrbanFlowError`) so an entrypoint can catch "anything that is
this pipeline misbehaving" without swallowing `KeyboardInterrupt` or a
`MemoryError`, and two branches that name *who owns the failure*:

* `ConfigError`  - the environment or startup arguments are wrong; the fix is
  outside the code, so the job must fail fast at startup (Module 23 §2).
* `PipelineError` - the environment was accepted but processing a batch,
  writing the lake, or publishing to Kafka did not go as planned.

Rules this module states and these types exist to keep:
  - never `except:` bare, never `except Exception: pass`;
  - catch the narrowest type that makes sense at that layer;
  - when re-raising across a layer, preserve the cause with `raise … from e`.
"""
from __future__ import annotations


class UrbanFlowError(Exception):
    """Base class for every error this pipeline raises deliberately.

    Library code raises a subclass of this; entrypoints may catch it to log a
    clean failure and return a non-zero exit code. Nothing below the entrypoint
    should catch it and continue.
    """


class ConfigError(UrbanFlowError):
    """Startup configuration or arguments are invalid. Fail fast, at boot."""


class PipelineError(UrbanFlowError):
    """A processing, lake-write, or publish step failed after a valid start."""
