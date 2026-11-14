# #28 Image build and Operator settings for the hosted service

- State: CLOSED (NOT_PLANNED)
- Labels: -
- Created: 2026-11-07T16:12:09Z
- Closed: 2026-11-14T19:25:23Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/28

## Parent

#24 (public state and standing rules there)

## What to build

Choose and record the Operator settings the hosted service runs the **unmodified public image** with (AGPL rule: no own image build, no patched image; release = pinned public tag `X.Y.Z` in `cube/compose.yaml`, [#58](https://github.com/artkoenig/family-agenda-cloud/issues/58)):

- OCR languages (the same for all Families, [#22](https://github.com/artkoenig/family-agenda-cloud/issues/22)). Public 0.6.0 bundles `deu`/`eng`/`osd` and Admins add further models into the tessdata volume; the decided `OCR_LANGUAGES` build argument / `OCR_EXTRA_LANGUAGES` start parameter do not exist. Since the Cube runs the published image, only a start parameter can take effect.
- Tesseract processes per worker, page limit per attachment.
- Maximum Backup upload size.
- Retention age (default 180 days) and closing grace period (default 7 days).
- "Force Recovery Kit confirmation" (default on).
- Plugin images and egress hosts in the cloud-only `plugins.yml` ([#68](https://github.com/artkoenig/family-agenda-cloud/issues/68)).

## Acceptance criteria

- [ ] Settings documented with rationale and kept in `cube/` (secrets in the root-only `.env`)
- [ ] `cube/compose.yaml` pins a public release tag; image provenance is the public release workflow, nothing built here
- [ ] Resource limits of `worker` match the Tesseract process count

## Blocked by

- Public Operator settings (OCR start parameter, Tesseract process count, page limit, upload limit, retention, grace period, kit confirmation): hand-off issues from [#78](https://github.com/artkoenig/family-agenda-cloud/issues/78), not yet created


---

**Comment by artkoenig, 2026-11-14T19:18:37Z**

Updated against public `main` @ `61fe07f` (release 0.6.0) and the later decisions of #46 / #77: dangling public issue numbers #224–#238 replaced, contradictions to the staging, rollback, key service, image build and dashboard decisions removed. Public state in #24.
