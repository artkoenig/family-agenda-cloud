---
status: accepted
---

# The Routing module is a separate program in front of unmodified public cores

The closed part of the hosted service, the Routing module, is its own program. It imports no package of the public repo, runs the public core's released image unmodified as a pool of identical, stateless cores, and talks to them over HTTP only, handing each request or run the Context of one Family. Whatever both sides must agree on (the Context's format, the operations that can be triggered from outside) is taken from the core's public documentation, not from its source ([#90](https://github.com/artkoenig/family-agenda-cloud/issues/90)).

The reason is the licence. The public repo is AGPLv3 with contributions under the DCO and no CLA (public ADR-0006). Once someone else has contributed, the owner cannot relicense the core, and a program that imports its packages into one process is very likely a work based on it and bound by the AGPL as a whole (`docs/research/agpl-contribution-options.md`, F3). A separate program that talks to the core over a network protocol can stay closed.

This supersedes the in-process plan of `docs/skalierung-refactorings.md`: its Phase 2, where the closed code imports the public packages and runs many Instances with an LRU cache in one process, and, for the public repo, its items 1.1 (composition root as a library), 1.4 (HTTP app without its own server) and 1.7 (publishing the packages). The core's side is [artkoenig/family-agenda#362](https://github.com/artkoenig/family-agenda/issues/362) instead.

## Consequences

- Memory grows with load, not with the number of Families: scaling is starting one more core, which needs to know nothing about Families.
- The core must accept a Context per request, serve below a path prefix and offer its due work, purge, preparation and password reset as operations triggered from outside. Until it does, the Routing module is built and tested against a stand-in core.
- The Routing module is on every web request and every scheduled run, and the Context carries a family key and a database password across the internal network, so it is encrypted. A core answers browser requests on one port, each with a Context, and its triggered operations on another, behind a bearer token. Only the Routing module holds the Context key and the token. The network does not keep other callers out: the plugins and their Egress Proxies share networks with the cores and can reach both ports, so the key and the token are what guard them.
- All Families share one browser origin, `app.family-agenda.cloud`, so a script that escapes one Family's pages could reach another's. A Content Security Policy is a gate before registration opens.
