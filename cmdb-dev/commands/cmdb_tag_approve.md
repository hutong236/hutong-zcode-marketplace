---
description: Explicitly confirm CMDB tag/image delivery after merge; a confirmed tag triggers the image build, or skip ships without an image.
argument-hint: "<REQ-123 or BUG-123> [vX.Y.Z | skip]"
skills: cmdb-development
---
The user explicitly confirms tag/image delivery for $ARGUMENTS. Verify Work Item, open Issue, merged PR, merged SHA and `waiting_tag_confirm`. If the argument is `skip`: do not tag or build; record the human skip confirmation, set `build_status: skipped`, close the Issue and mark done. Otherwise resolve the tag name from the given vX.Y.Z, or read the latest `v*` tag and increment its patch, stating the chosen name before pushing. Never create or push a git tag without this explicit confirmation. Create an annotated tag on the merged SHA, push it, set building; the tag push triggers the image-build workflow; wait/check the run and dispatch Build Checker. Only after image push evidence store image/tag/digest/run URL, close Issue and mark done. On build failure leave Issue open and Blocked.
