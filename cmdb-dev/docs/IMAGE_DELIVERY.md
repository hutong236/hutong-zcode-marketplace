# Verifiable image delivery

The bundled `CMDB Build Image` workflow accepts only pushed `v*` tags and then
enforces a strict SemVer form. It rejects a tag when its commit is not contained
in the repository's current default branch.

For an accepted tag the workflow:

- normalizes the GHCR image name to lowercase;
- builds and pushes with BuildKit SBOM and maximum provenance enabled;
- records the immutable `sha256:` digest and all emitted tags in
  `delivery-metadata.json`;
- uploads that file as the `cmdb-delivery-<tag>` Actions artifact;
- creates or updates the corresponding GitHub Release with the metadata asset.

Build Checker must independently query the GHCR package version (or inspect the
remote manifest) and compare its digest and tag with the workflow artifact. It
also records separate immutable manifest digests for the SBOM and provenance
attestations. A
successful workflow or log line alone is not proof of image delivery. The
verified commit must equal the Work Item's merged SHA, and the Release asset
must carry the same digest.
