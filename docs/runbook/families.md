# Families runbook

The Operator's day-to-day work with the Families of the hosted service: creating, suspending, resuming and deleting
them, a new core version, an Admin's lost password, whether a Family's due work runs, and the mails the Routing
module sends. Setting the Cube up is in the
[setup runbook](setup.md).

Every command is run on the Cube, in `/opt/family-agenda`, in the Router's container:

```bash
ssh root@family-agenda.cloud
```

```bash
cd /opt/family-agenda && docker compose exec -T router routing <command>
```

Below only `routing <command>` is written. A command prints what the Operator asked for on a line of its own; the
lines in JSON around it are its log. It ends with `0` when it did what it says, `1` when it did not, and `2` when it
was called wrongly, after which it prints all commands, or when a setting in the `.env` is missing or wrong.
`routing` with nothing after it prints the commands too.

When a command fails, its reason is in the `error` of its last log line, such as
`"error":"The confirmation does not match the Family id; nothing was deleted"`.

The commands and what they print were run on 2026-11-16 on the Cube, with the bucket mounted
([#103](https://github.com/artkoenig/family-agenda-cloud/issues/103)).

A Family id is the part of a Family's address after the host, 36 characters long:
`https://app.family-agenda.cloud/<Family id>/`.

## Two rules until launch

- **One Family per browser.** Do not sign in as an Admin of more than one Family in the same browser, the smoke
  check's Family included; use a private window or another browser profile per Family. All Families are served from
  one origin, and until every page carries a Content Security Policy
  ([launch checklist](../launch-checklist.md), gate 14) script from one Family's content could reach another Family's
  pages open in the same browser.
- **Logs stay on the Cube.** The Family id is in every address, and so is an Agenda's id, which is all that keeps
  the Agenda's address private. Caddy writes no access log. The Router logs each request with the Family id, the method
  and the status, never the path; the cores' logs may hold paths. The logs are Docker's, on the Cube, and are gone when
  a deploy replaces the container. Do not copy them off the Cube, keep them longer than that, or put lines with ids
  into tickets, mails or chats; cut the ids out first.

## Create a Family

Families create themselves: a person registers at Logto, a core creates the Family's Logto Organization and posts
`family.created` to the receiver (`docker compose logs receiver`), which creates the Family as `create` does and
answers once it is active. The core posts again until it gets that answer, so a registration that failed part-way is
finished by the next delivery; there is nothing to run by hand.

By hand, for a Family whose Logto Organization exists already, such as the smoke check's:

```
routing create --organization-id <Logto Organization id>
```

`--time-zone <IANA zone>` sets the Family's time zone when it is not the service's default. It prints the Family's
address:

```
https://app.family-agenda.cloud/190ca3a1-78b7-45d7-b735-e8cd59b04509/
```

One Organization belongs to one Family; another Family with it is refused. Its Admins sign in at Logto; the Operator
gives no password.

If it fails part-way (`Creating the Family failed; run create again with --family-id to finish it`), the log names the
Family id, and `routing families` lists the Family as `being_prepared` unless it failed before the Family was
entered into the Directory. Run the same command again with
`--family-id <that id>`; it finishes what is missing and prints the address. Running it once more does no harm.

## Suspend and resume a Family

```
routing suspend --family-id <id>
```

```
The Family 190ca3a1-78b7-45d7-b735-e8cd59b04509 is suspended
```

From then on the Family's address answers `404`, as an unknown one does, and its due work, purge and sweep no longer
run. Its data stays.

```
routing resume --family-id <id>
```

```
The Family 190ca3a1-78b7-45d7-b735-e8cd59b04509 is active again
```

Both may be run again; they say the same and change nothing. A deleted Family cannot be resumed.

A Locked Family can be suspended too. Resumed, it stays Locked: its address still answers `404` and its due work does not
run until it is unlocked.

```
The Family 190ca3a1-78b7-45d7-b735-e8cd59b04509 is resumed and stays Locked: it is not routed to or scheduled until it is unlocked
```

## Open Trials

Until Trials are open, no Family has a Trial and none is Locked when one ends. Open them once, at launch:

```
routing open-trials [--except <Family id>]...
```

```
The Family 17968e51-4cd4-4cb8-b073-725596d492a2 starts its Trial
Trials are open; 1 started now
```

It starts a Trial now for every Family that has none, is not deleted and never had a Subscription, except those named
with `--except` (the Operator's own Families, for instance). From then on a Family that registers starts its Trial when
it is created; one the Operator creates with `routing create` gets none. Running it again starts only the Trials of
Families added since, leaving out those named with `--except` again, and keeps when Trials were first opened.

To give one Family its Trial, such as one the Operator created:

```
routing start-trial --family-id <id>
```

```
The Family 190ca3a1-78b7-45d7-b735-e8cd59b04509 starts its Trial 2026-11-24T09:00:00.000Z; it ends 2026-12-08T09:00:00.000Z
```

A Trial lasts 14 days and is had once: it is refused for a Family that had its Trial or a Subscription, even an ended
one, and for a deleted Family.

## The founder of a Family

The founder is the Logto user who registered the Family, whom a Subscription is ordered for. The Directory reads it from
the Family's Organization (`customData.founderUserId`) when the Family is created, or the first time it is needed for a
Family created before. If the Organization names none, or the wrong person, record it by hand; it needs
`IDP_MANAGEMENT_*`:

```
routing set-founder <Family id> <Admin's email or user id> [--force]
```

```
The Family 190ca3a1-78b7-45d7-b735-e8cd59b04509 has the founder user_7f3k2
```

Only a person who is an Admin of the Family now can be its founder. A founder recorded before is overwritten only with
`--force`.

## Delete a Family

Cannot be undone. `--confirm` must repeat the Family id; with anything else nothing is deleted
(`The confirmation does not match the Family id; nothing was deleted`).

```
routing delete --family-id <id> --confirm <id>
```

```
The Family 190ca3a1-78b7-45d7-b735-e8cd59b04509 is deleted
```

Only this line means the Family is deleted. If the command ends without it
(`Deleting the Family did not finish; run delete again to finish it`), run it again until it prints the line. The
usual reason is the blob bucket not being mounted (`The blob root … is not there`): see `docker compose ps blob-mount`
and its log, then run `delete` again. Another is Logto not answering (`Logto's Management API answered deleting the
Organization with …`, `… listing the Organization's users with …`, `… deleting an Admin's user with …`, or
`Logto refused the management client's credentials`): see `docker compose ps logto` and `IDP_MANAGEMENT_CLIENT_*` in
the `.env`. A run that began deleting (`The Family is marked deleted` in its log) leaves
the Family's address answering `404` and nothing scheduled for it, whether it finished or not; a run that was
refused (`Deleting the Family was refused`) changed nothing.

What can be said in writing once the line was printed:

- The Family's database and its database role are dropped, and with them every Agenda, Item, Source and Admin of the
  Family.
- The Family's blobs are removed from the bucket. The bucket keeps removed objects as noncurrent versions for 14 days
  and then deletes them for good.
- The Family's key and its database password, which the Directory held wrapped, are destroyed.
- The Family's Admins' Logto users are deleted, with their email address and password, and only then its Logto
  Organization. Logto keeps no user of the deleted Family: none of its Admins can sign in any more, and each may
  register or be invited again. The log says how many users were deleted (`The Family's Admins' users are
  deleted`), without their email addresses.
- Nothing is routed to the Family and nothing runs for it.
- The Directory keeps one entry: the Family id, its time zone, the names its database and its blob location had,
  when it was created and deleted, and how its due work last ran. It holds no name and no email address.
- Copies in the Operator's backups go when the backups do, 14 days later at the latest.

So: "deleted on <date>; the last copies are gone on <date + 14 days>".

## A new core version

The steps are in the setup runbook, [A new core version](setup.md#8-a-new-core-version): change the image, deploy.
No command rolls a core version out to the Families, and none is run per Family: a core of the new release prepares
each Family the first time it opens it.

What a Family that failed looks like:

- Its address answers `503` with `Retry-After: 30`, and the Router's log says
  `Every core that answered refused to open the Family` with what each core answered.
- `routing families` shows its due work as `failed:` with the cores' answer, how many failures in a row, and when it
  is tried next.

How it is retried: by itself. Every request to the Family's address and every run of its due work asks the cores
again; due work is tried again after a delay that doubles with each failure in a row, up to a quarter of an hour.
There is nothing to run by hand.

What to do, by what the cores answer:

- `503 migrating`: a core is still preparing the Family. Wait; a large Family takes longer than one request does.
- `409 migrated-by-newer-release` from every core: cores of the old release are still the only ones running. Check
  `docker compose ps core` and the image the cores run; deploy again.
- Anything else that stays for more than a quarter of an hour: read the cores' log for that Family id
  (`docker compose logs --since 1h core | grep <id>`). Suspend the Family if its Admins should see `404` instead of
  errors meanwhile. Going back to the release before means restoring a backup, for all Families.

## An Admin's lost password

Admins sign in at Logto, and reset a lost password there themselves ("Forgot password"). The Routing module holds no
password and has no command for it. When that does not help, the Operator finds the person in the Logto console and
sets a password or sends a reset; the Family is not touched.

## An invitation that no longer works

An invitee who cancels the terms dialog on opening the invitation link uses up its one-time token: Logto shows
"Invalid link" and creates no account. Nothing is wrong with the Family; an Admin of it invites the person again on
the Admins page, and the new link works once.

## When a Family's due work last ran

```
routing families
```

One line per Family, the columns separated by tabs: the Family id, its status (`being_prepared`, `active`,
`locked`, `suspended`, `deleted`; `locked` is an active Family that is Locked, a suspended one shows `suspended`), then when its due work last ran and how it ended.

```
17968e51-4cd4-4cb8-b073-725596d492a2	active	due work never ran
190ca3a1-78b7-45d7-b735-e8cd59b04509	active	due work ran 2026-11-16T11:56:09.121Z	succeeded: 0 Sources polled, 0 failed
190ca3a1-78b7-45d7-b735-e8cd59b04509	active	due work ran 2026-11-16T11:57:09.130Z	failed: No core ran due-work: cores:3001 stands for no core	1 failure in a row, next try 2026-11-16T11:59:00.000Z
```

Times are UTC. Due work runs once a minute for every active Family, so:

- `due work never ran` is right for a Family created within the last minute, and for one suspended or left
  `being_prepared` since it was created.
- `succeeded` with a time more than a few minutes old on an active Family means the Scheduler is not running:
  `docker compose ps scheduler`, `docker compose logs --tail 50 scheduler`.
- `succeeded: … N failed` with N above 0 means the run went through and N of the Family's Sources could not be polled.
  That is the Family's own matter, such as a wrong password of a mailbox or a calendar that is gone.
- `failed:` on one Family alone points at that Family (see [A new core version](#a-new-core-version)); on all of
  them, at the cores or Postgres: `docker compose ps`.
- A suspended, Locked or deleted Family keeps the line of its last run.

## The mail outbox

The mails the Routing module sends wait in the outbox, the table `mail_outbox` of the Directory
([#233](https://github.com/artkoenig/family-agenda-cloud/issues/233)). Whatever writes a mail puts it in with the
change it tells of, in one transaction; the `mail-sender` service sends it through the mailbox of
[step 5 of the setup](setup.md#5-mailbox), and is the one service that holds the mailbox's password (`SMTP_PASSWORD`
of the `.env`). It sends at most 300 mails in any hour, below IONOS's 500 together with Logto's codes. A mail the
mail server does not take is tried again after 1, 2, 4 … minutes, an hour at most, until it goes; on its fifth failure
in a row the sender logs `A mail keeps failing to be sent; it is still tried` as an error, once per mail. A mail sent
30 days ago is deleted by the daily sweep.

The sender's log names a mail by its id, type (such as `confirmation`) and Family id, and the failure by its SMTP
code (`reason`, such as `EENVELOPE 550`): never its address, subject or text.

```bash
docker compose logs --tail 50 mail-sender
```

### What is waiting

```
routing outbox
```

One line per mail not sent yet, the oldest first, the columns separated by tabs: its id, type and Family id (`-` for
a mail about no Family), when it was put in, and either when it is due or how many attempts failed, when the next is
and the last error, its addresses replaced by `address`.

```
12	confirmation	190ca3a1-78b7-45d7-b735-e8cd59b04509	queued 2026-11-16T11:56:09.121Z	not tried yet, due 2026-11-16T11:56:09.121Z
13	confirmation	17968e51-4cd4-4cb8-b073-725596d492a2	queued 2026-11-16T11:57:02.004Z	5 failed attempts, next try 2026-11-16T12:13:40.551Z	last error: Can't send mail - all recipients were rejected: 550 <address>: Mailbox unavailable
```

`routing outbox` prints nothing when every mail is sent. Many lines not tried yet, with due times minutes old, mean
the sender is not running (`docker compose ps mail-sender`) or the hour's 300 are used up; failed attempts on every
mail point at the mailbox (password, IONOS's limit, `ESOCKET` or `ETIMEDOUT`: the mail server not reached), on one
mail alone at its recipient.

Only when the person a mail was for asks about it, look at its address, by its id:

```bash
docker compose exec -T postgres psql -U postgres -d directory -Atc "select mail_to, sent_at from mail_outbox where id = 13"
```

Do not copy addresses, subjects or texts off the Cube; the [rule on logs](#two-rules-until-launch) holds for them too.

### Bounces

A mail the mail server took but could not deliver comes back to `no-reply@family-agenda.cloud` as a bounce (a
delivery status notification). **Once a week**, read the bounces in that mailbox in the Operator's mail client and
delete them; the privacy policy promises they are deleted once read, within 30 days at most. A bounce for an address
that does not exist needs nothing more: the Family's Admin entered it. Bounces for many recipients at once, or IONOS's
notice of a limit, mean the mailbox's reputation or limit is the matter: see the next section.

### Another mail server: Scaleway TEM

The mailbox is IONOS Mail, which has no bounce webhooks and a limit of its own
([docs/research/eu-transactional-mail.md](../research/eu-transactional-mail.md)). To send through Scaleway's
Transactional Email instead:

1. Before the switch, the privacy policy (`site/legal/datenschutz.de.md` and `.en.md`, "E-Mail-Versand" and the
   processors) must name Scaleway SAS as the mail's processor, with its address and data location, and a DPA with
   Scaleway must be in place. Deploy it first.
2. Set up the domain `family-agenda.cloud` in Scaleway TEM (its SPF, DKIM and MX records at IONOS SE, as Scaleway
   lists them), and create an IAM API key that may send mail. Scaleway sends 10,000 mails a month unless
   its support raises the limit.
3. In the `.env`: `SMTP_HOST=smtp.tem.scaleway.com`, `SMTP_PORT=465`, `SMTP_USER=<the project id>`,
   `SMTP_PASSWORD=<the API key's secret>`. The From stays `no-reply@family-agenda.cloud`.
4. Logto's codes go through the same server: run the core's setup again ([Setting up Logto](setup.md#setting-up-logto),
   step 3) with the same `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` and `SMTP_PASSWORD`, then `scripts/deploy.sh`.
5. Check: `docker compose logs --tail 20 mail-sender` shows `The mail sender is running`; the next mail put in is
   `A mail was sent`, and `routing outbox` empties.

To go back, the same steps with IONOS's values, which are the defaults: remove the `SMTP_HOST`, `SMTP_PORT` and
`SMTP_USER` lines.
