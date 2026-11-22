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
One container of the public Family Agenda image, unmodified, in the pool; it keeps no data of its own and serves whichever Family the Context it is given names. It answers browser requests, each with a Context, on its caller port, and operations triggered from outside, such as due work and purge, on its trigger port. It prepares a Family's database for its release when it first opens it, and refuses a Family whose database a newer release has migrated.
_Avoid_: Instance (one installation for one Family), backend, worker

**Pool**:
The cores that run now: the replicas of one service on the Cube, all alike, so that any of them serves any Family. The Operator scales it by one number, and the Routing module knows it by one name alone, which it resolves at each call.
_Avoid_: Cluster, core list, upstreams

**Supplied mode**:
The core's mode in which it opens no Family of its own but is handed one Context per request or triggered operation.
_Avoid_: Multi-tenant mode, cloud mode

### Routing module

**Routing module**:
The closed program in front of the pool of cores, made of the Router, the Directory, the Scheduler, the Receiver and Provisioning; the only thing that knows which Families exist.
_Avoid_: Gateway, control plane, proxy

**Router**:
The Routing module's entrance for web requests, which finds a request's Family by the Family id in its path and hands the request with that Family's Context to any core, and to the next one when a core refuses to open the Family.
_Avoid_: Load balancer, front door

**Central sign-in**:
The Router's sign-in from the landing page, with its own Logto client, which finds the person's Family by the Organization their ID token claims and sends them into it, or to a page saying it is being prepared or not available; the core then signs them in itself.
_Avoid_: Login portal, SSO hub

**Directory**:
The one list of every Family, holding per Family its Family id, status (being prepared, active, suspended, deleted), database and role, wrapped family key and database password, blob location (the Family's own blob folder), time zone, and how its due work last ended.
_Avoid_: Registry, tenant table, control database

**Scheduler**:
The Routing module's clock, which gives each active Family's core the occasion to run its due work and its purge; the core decides what is due.
_Avoid_: Cron, job runner, worker

**Receiver**:
The Routing module's entrance for the cores' `family.created`, which creates the Family a core announces once that Family's Admin has registered; reached by the cores only.
_Avoid_: Webhook handler, callback

**Provisioning**:
How the Routing module creates a Family, from the Receiver or the Operator's command line, and the command line that suspends, resumes and deletes it.
_Avoid_: Onboarding, setup, admin tool

### Families and keys

**Family id**:
As in the public glossary; in addition, it is the first path segment of the Family's address.
_Avoid_: Tenant id, slug, subdomain

**Organization id**:
The id of the Logto Organization that is a Family at the one Identity Provider of every Family; the Directory holds it per Family, and a Context names it.
_Avoid_: Tenant id, group

**family.created**:
What a core posts to the Receiver, signed, once it has created a registered Family and its Organization: the Family id and the Organization id. Posted again until answered with a 2xx.
_Avoid_: Signup event, registration hook

**Family key**:
The key, one per Family, that encrypts that Family's Source credentials; a leaked one opens only that Family's.
_Avoid_: Tenant key

**Context**:
What a core is given to serve one Family for one request or run: its Family id, database, family key, the blob directory (the folder its blob location lies in, named by the Family id), time zone, public address with the path prefix, and Organization id.
_Avoid_: Tenant config, session, request context

**Operator key**:
The Operator's key that wraps every family key and Family database password kept in the Directory.
_Avoid_: KMS key

**Context key**:
The key, shared by the Routing module and the cores, that protects every Context.
_Avoid_: Shared secret, Ticket key

**Trigger token**:
The bearer token, shared by the Routing module and the cores, that a call to a core's trigger port must carry.
_Avoid_: API key, operations secret
