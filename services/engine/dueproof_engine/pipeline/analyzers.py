"""One analyzer per profile.

pipeline/analyze.py compiles its vocabulary into module-level patterns when it
is imported, which is what keeps it fast and simple. A request may name any
shipped profile, so each profile gets its own instance of that module: the
same source executed once more with PROFILE set, cached for the life of the
process. The default profile's instance is the ordinary import.
"""
from __future__ import annotations

import importlib.util
import threading
import types

from dueproof_engine import profiles
from dueproof_engine.pipeline import analyze as _default

_lock = threading.Lock()
_cache: dict[str, types.ModuleType] = {_default.PROFILE: _default}


def analyzer(profile: str) -> types.ModuleType:
    """The analyze module reading `profile`. Raises profiles.ProfileError for
    an unknown or broken profile."""
    if mod := _cache.get(profile):
        return mod
    profiles.load(profile)                       # validates the name and the profile
    with _lock:
        if mod := _cache.get(profile):
            return mod
        spec = importlib.util.find_spec("dueproof_engine.pipeline.analyze")
        mod = importlib.util.module_from_spec(spec)
        mod.PROFILE = profile
        spec.loader.exec_module(mod)
        _cache[profile] = mod
        return mod
