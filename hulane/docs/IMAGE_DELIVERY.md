# Verifiable image delivery

## Release cadence

Releases are on-demand and batched, never a per-merge ritual. Most work items
persist `delivery_required: false` and close as human-confirmed skips; the
image delivery chain below runs only when the user explicitly asks to ship.
To ship a batch, open a small `maintenance` release item that bumps the
project version, merge it, and confirm the tag at its Gate C — the tagged
commit contains every previously merged SHA, so one verified image covers the
whole batch. The workflow itself stays strict; releasing less often is what
respects GitHub free-plan quotas (Actions minutes and GHCR storage). The
build uses the free, auto-evicted GitHub Actions cache instead of a GHCR
buildcache ref, emits only the SemVer tags, and keeps the metadata artifact
for 7 days because the Release asset is the permanent copy.

The bundled `Hulane Build Image` workflow accepts only pushed `v*` tags and then
enforces a strict SemVer form. It rejects a tag when its commit is not contained
in the repository's current default branch.

For an accepted tag the workflow:

- normalizes the GHCR image name to lowercase;
- builds and pushes with BuildKit SBOM and maximum provenance enabled;
- records the immutable `sha256:` digest and all emitted tags in
  `delivery-metadata.json`;
- uploads that file as the `hulane-delivery-<tag>` Actions artifact;
- creates or updates the corresponding GitHub Release with the metadata asset.

Build Checker must independently query the GHCR package version (or inspect the
remote manifest) and compare its digest and tag with the workflow artifact. It
also records separate immutable manifest digests for the SBOM and provenance
attestations. A
successful workflow or log line alone is not proof of image delivery. The
verified commit must equal the Work Item's merged SHA, and the Release asset
must carry the same digest.
