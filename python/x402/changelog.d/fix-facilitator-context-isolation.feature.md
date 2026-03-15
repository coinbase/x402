---
title: "Enhance FacilitatorContext with isolation fix and utility methods"
---

Enhanced the `FacilitatorContext` class with improved isolation and utility methods:

**Bug Fix:**
- Fixed extension dictionary isolation bug where modifying the original extensions dictionary would affect the context
- `FacilitatorContext` now creates a copy of the extensions dictionary during initialization

**New Utility Methods:**
- Added `has_extension(key)` to check if an extension is registered
- Added `get_extension_keys()` to retrieve all registered extension keys  
- Added `get_extension_count()` to get the number of registered extensions

**New Test Coverage:**
- Added comprehensive unit tests for `FacilitatorExtension` and `FacilitatorContext` classes
- Tests cover edge cases, unicode keys, special characters, and custom extension subclasses
- Tests validate proper isolation behavior and all new utility methods

This change improves the robustness and usability of the facilitator extension system while maintaining backward compatibility.