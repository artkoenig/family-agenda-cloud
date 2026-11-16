---
status: accepted
---

# The bucket of the Families' blobs is mounted with rclone, as a service of the compose project

The blobs of all Families lie in one Object Storage bucket, and the cores keep writing files: the bucket is mounted as a file system on the Cube, and each Family's blob location is a folder below `families` in it ([#102](https://github.com/artkoenig/family-agenda-cloud/issues/102), amendment to [#90](https://github.com/artkoenig/family-agenda-cloud/issues/90)). No blob store is written for it. The tool is rclone (`rclone mount`), run as the service `blob-mount` of `cube/compose.yaml`.

Why rclone, and why as a service and not set up on the Cube itself:

- rclone knows IONOS Object Storage by name as a provider of its S3 backend; s3fs, goofys and mountpoint-s3 are written for AWS and only happen to work elsewhere.
- It is configured by environment variables alone, so the bucket's credentials come from the `.env` on the Cube like every other secret, and no file with them is written when the Cube is set up.
- It is an image pinned by digest like the others, brought to the Cube by the same deploy, and Compose starts the cores and the Routing module only once it is healthy. A mount of the Cube's own (fstab, a systemd unit) would be a second way things reach the Cube, and Compose could not wait for it.

How it is mounted, and what each setting is for:

- The mount is made in the service's container and shows on the Cube at `/var/lib/family-agenda-blobs/bucket` (bind with `rshared`), and from there in the cores and the Routing module (bind of `/var/lib/family-agenda-blobs` with `rslave`). They see the mount whenever it comes, also one that comes anew after they started.
- The blob root is `bucket/families`. `families` exists in the bucket alone, and the directory on the Cube is root's: while nothing is mounted, a core (uid 1000) cannot make a Family's folder, so its write fails instead of landing on the Cube's disk; `routing delete` does not finish, because the blob root is not there; and the cores are not healthy, because their health check looks for the blob root.
- `--vfs-cache-mode off`: nothing is kept on the Cube. A blob is in the bucket when the core's write returns, and a write to a bucket that does not answer fails. The core writes a blob in one go to a new name and reads it in one go, which is all this mode allows.
- Timeouts of 5 seconds and no retries, for every call rclone makes: a bucket that does not answer fails a write within seconds. The directory cache is left at its default; shortening it made such a write take three times as long.
- `--allow-other --default-permissions --uid 1000 --gid 1000 --umask 077`: the mount belongs to the cores' user and nobody else's.
- Directory markers on: a folder is an object, so `families` and a Family's empty folder outlast a mount.
- rclone never makes the bucket (`no_check_bucket`), and lists it before mounting: with a wrong name or key the service does not come up, and no second bucket without versioning appears.

## Tried before it went to the Cube

rclone 1.76.0, mounted in a container against a stand-in S3 server, with the file calls the core's blob store makes (Node, uid 1000). Docker Desktop cannot hand a mount on to other containers, so everything below was done inside the mounting container.

| What | Result |
|---|---|
| Make a Family's folder, write a new blob (exclusive create), read it | works |
| Write to a name that exists | fails (`EEXIST`), as the core expects |
| Rename a blob | works (a copy and a delete in the bucket). The core in supplied mode writes blobs in place and renames none |
| Another user reads the mount | refused |
| Remove a Family's folder | its objects are gone from the bucket |
| Write with the S3 server gone | fails (`EIO`) at once |
| Write with the S3 server hanging | fails (`EIO`) after about 15 seconds; a read after about 20 |
| Write after the server is back | works |
| Start with a bucket that is not there | the service starts over and over; no bucket is made |
| Restart the service | mounted again, blobs readable |

Not tried, and to be checked on the Cube (`docs/runbook/setup.md`, "Checking the blob mount"): that the mount reaches the cores, IONOS itself, and what a restart of `blob-mount` does to running cores.

## Consequences

- `blob-mount` holds `/dev/fuse`, `SYS_ADMIN` and no AppArmor profile, which mounting needs. It is the one service with such rights; it listens on nothing and reaches the internet only.
- Every blob read and write is a call to the bucket. Blobs are few and small next to the databases, so this is accepted; a cache on the Cube would bring back the state the cores are meant not to have.
- While the bucket is unreachable, attachments cannot be stored or shown, and the rest of a Family's Agenda still works.
- The bucket keeps noncurrent versions for 14 days, so a deleted Family's blobs are gone from the bucket for good 14 days after `routing delete`.
- The mount is one process on one Cube. More than one Cube would mount the same bucket each; nothing in the cores depends on a lock in the file system.
