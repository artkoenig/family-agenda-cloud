# Family Agenda Cloud

Hosts Family Agenda as a service: many Families served by one pool of unmodified public cores, with the closed parts that decide which Family a request is for. Terms of the product itself (Family, Admin, Agenda, Source, Ticket, Egress Proxy and the rest) are defined in the public repo's `GLOSSARY.md` and mean the same here.

## Language

### Operation

**Operator**:
The person who runs the hosted service: creates, suspends and deletes Families and keeps the Cube and its secrets.
_Avoid_: Admin (an Admin manages one Family), provider, host

**Cube**:
The one server the hosted service runs on.
_Avoid_: Server, host, VM, node

**Core**:
One container of the public Family Agenda image, unmodified, in a pool of identical ones; it keeps no data of its own and serves whichever Family the Context it is given names.
_Avoid_: Instance (one installation for one Family), backend, worker

### Routing module

**Routing module**:
The closed program in front of the pool of cores; the only thing that knows which Families exist. It is made of the Router, the Directory, the Scheduler and Provisioning.
_Avoid_: Gateway, control plane, proxy

**Router**:
The part of the Routing module that finds the Family of a web request by the Family id in its path and hands the request, with that Family's Context, to any core.
_Avoid_: Gateway, load balancer

**Directory**:
The one list of every Family with where its data lives, its wrapped family key, its settings and its status (being prepared, active, suspended, deleted). Only an active Family is routed to and scheduled.
_Avoid_: Registry, tenant table, control database

**Scheduler**:
The part of the Routing module that gives each active Family's core the occasion to run its due work and its purge; the core decides what is due.
_Avoid_: Cron, job runner, worker

**Provisioning**:
The part of the Routing module, reached by the Operator through a command line, that creates, suspends, resumes and deletes a Family and prepares every Family for a new core version.
_Avoid_: Onboarding, setup, admin tool

### Families and keys

**Family id**:
The one identifier of a Family, a UUID that Provisioning draws: the key of its Directory entry, the first path segment of its address, and the Family id the core writes into Tickets.
_Avoid_: Tenant id, slug, subdomain

**Context**:
Everything a core needs to serve one Family for one request or run: its Family id, the database to open, its family key, its blob location, its time zone, its public address with the path prefix, and the Identity Provider settings. It is encrypted and signed with the Context key and expires after a short time.
_Avoid_: Tenant config, session, request context

**Operator key**:
The key that wraps every family key and Family database password kept in the Directory; it lives only in the Cube's environment and the password manager, never in the Directory.
_Avoid_: Master key (the public core's own key), KMS key

**Context key**:
The key, shared by the Routing module and the cores, that encrypts and signs every Context.
_Avoid_: Shared secret, Ticket key (that is `EGRESS_TICKET_KEY`)
