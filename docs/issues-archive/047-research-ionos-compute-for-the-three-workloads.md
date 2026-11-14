# #47 Research IONOS compute for the three workloads

- State: CLOSED (COMPLETED)
- Labels: wayfinder:research
- Created: 2026-11-12T08:54:50Z
- Closed: 2026-11-12T09:00:31Z
- Was: https://github.com/artkoenig/family-agenda-cloud/issues/47

## Question

Which IONOS products can run the public image as `api`, `worker` and `cleanup` workloads plus self-run helpers (OpenBao, Authentik) in a German region: Managed Kubernetes, Cloud Cubes / VPS, Compute Engine servers, any container service? For each: smallest sensible setup and monthly price, scaling and rolling updates, load balancer and public IPs, private networking, container registry, what the Operator must maintain alone (OS patches, cluster upgrades), known limits.

---

**Comment by artkoenig, 2026-11-12T09:00:30Z**

Resolution (prices net, IONOS price list v2026-10-29, 730 h/month):

- No blocker. All options run in Germany (Frankfurt, Berlin).
- IONOS has no container service between VMs and Kubernetes. Choice: Managed Kubernetes, or VMs with Docker Compose.
- Managed Kubernetes, public pool, 2 vCPU nodes (2 vCPU / 8 GB): about 100 EUR/month. Control plane free, IONOS replaces nodes weekly (no OS patching), rolling updates and replicas built in. Recommended.
- Cubes + Docker Compose, 2 Basic Cube M: about 40 EUR/month. Operator patches the OS and builds rollout and scaling himself; disk sits on one host.
- vCPU servers: same burden as Cubes at 2 to 3 times the price; VM Auto Scaling is Early Access.
- ionos.de VPS is a separate platform outside IONOS Cloud: not a fit.
- Catches on Kubernetes: `LoadBalancer` service is a static IP on one node, not a real load balancer (failover undocumented, test it); private node pools need NAT Gateway + NLB (about +50 EUR/month); no IPv6.
- Registry: not needed for the public image; Private Container Registry exists (Frankfurt only).

Details, comparison table, sources and open points: `docs/research/ionos-compute.md`

