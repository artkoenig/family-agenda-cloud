# IONOS compute for the three workloads

Research for [#47](https://github.com/artkoenig/family-agenda-cloud/issues/47), map [#46](https://github.com/artkoenig/family-agenda-cloud/issues/46). Researched 2026-11-12.

## Question

Which IONOS products can run the public image as `api`, `worker` and `cleanup` workloads plus the self-run helpers (OpenBao, Authentik) in a German region? For each: smallest sensible setup and monthly price, scaling and rolling updates, load balancer and public IPs, private networking, container registry, what the Operator maintains alone, known limits.

## Short answer

- No blocker. IONOS Cloud can run all of it in Germany (Frankfurt `de/fra`, `de/fra/2`, Berlin `de/txl`).
- IONOS has **no container service between VMs and Kubernetes** (no serverless containers, no app platform). The choice is: Managed Kubernetes, or VMs (Cubes / vCPU servers) with Docker Compose.
- **Managed Kubernetes** (public node pool, 2 vCPU nodes with 2 vCPU / 8 GB): about **100 EUR/month** net. Control plane is free and managed; nodes are replaced by IONOS in a weekly maintenance window, so there is no OS patching. Rolling updates, replicas, node autoscaling and a CronJob for `cleanup` come with Kubernetes. Fits the "prefer managed" rule best.
- **Cubes + Docker Compose** (2 Basic Cube M): about **40 EUR/month** net. Cheapest, but the Operator patches the OS, builds his own rollout and scaling, and a Cube's disk lives on one physical host.
- **vCPU servers + Docker Compose**: same burden as Cubes at 2 to 3 times the price per GB RAM; only worth it for live resize, network block storage or VM Auto Scaling (still Early Access).
- The **VPS** product of ionos.de is a different platform outside IONOS Cloud; it cannot sit in the same private network as the managed database. Not a fit.
- Cost per Family for compute: about 1.00 EUR at 100 Families on Managed Kubernetes (0.40 EUR on Cubes); with the same or a doubled setup at 1000 Families about 0.10 to 0.20 EUR.

Recommendation for the decision ticket: Managed Kubernetes with one public vCPU node pool. Take Cubes only if 60 EUR/month matters more than the Operator's time.

## Prices used

All prices are net (plus VAT), from the price list of IONOS CLOUD GmbH (DE), version `v2026-10-29`, valid from 2026-10-29 [1]. Monthly figures here use 730 hours.

| Item | Price |
|---|---|
| vCPU server: vCPU / GB RAM | 0.012 EUR/h / 0.002 EUR/h |
| Managed Kubernetes node, vCPU type: vCPU / GB RAM | 0.017 EUR/h / 0.0025 EUR/h |
| Managed Kubernetes node, Dedicated Core: core / GB RAM | 0.04 EUR/h / 0.0045 EUR/h |
| Managed Kubernetes control plane | no line in the price list; "free of charge" per service catalog [2] |
| Basic Cube S (2 vCPU / 4 GB / 120 GB NVMe) | 0.013 EUR/h = 9.49 EUR/month |
| Basic Cube M (4 vCPU / 8 GB / 240 GB NVMe) | 0.024 EUR/h = 17.52 EUR/month |
| Basic Cube L (8 vCPU / 16 GB / 480 GB NVMe) | 0.044 EUR/h = 32.12 EUR/month |
| Memory Cube M (4 vCPU / 16 GB / 240 GB NVMe) | 0.032 EUR/h = 23.36 EUR/month |
| Block storage Essential / Balanced / Performance | 0.04 / 0.07 / 0.15 EUR per GB per 30 days |
| Reserved public IPv4 | 5.00 EUR per 30 days |
| Network Load Balancer, Application Load Balancer | 0.02 EUR/h per forwarding rule (first 5), minimum 1 rule = 14.60 EUR/month; data processing free |
| NAT Gateway | 0.04 EUR/h = 29.20 EUR/month; data processing free |
| Outbound traffic | first 2 TB free, then 0.03 EUR/GB |
| Private Container Registry | 0.04 EUR per GB per 30 days; traffic not charged [1][9] |

## Comparison

| | Managed Kubernetes (public node pool) | Cubes + Docker Compose | vCPU servers + Docker Compose | VPS (ionos.de) | Container service |
|---|---|---|---|---|---|
| What it is | Kubernetes cluster; IONOS runs the control plane, nodes are VMs in the Operator's virtual data center [3] | VM with fixed template and NVMe disk on the same host [6] | VM with freely chosen cores, RAM and network block storage [7] | Fixed-price virtual server of the hosting business, managed in the Cloud Panel, not in IONOS Cloud [11] | Does not exist: the docs list only Managed Kubernetes, Private Container Registry, Red Hat OpenShift, SUSE Rancher under Containers [12] |
| Smallest sensible setup | 1 pool, 2 vCPU nodes with 2 vCPU / 8 GB / 50 GB Performance each; 1 reserved IP for the ingress | 2 Basic Cube M (one for `api`/`worker`/`cleanup` + reverse proxy, one for OpenBao + Authentik); 1 reserved IP | 2 servers with 2 vCPU / 4 GB / 50 GB Balanced; 1 reserved IP | not assessed further | n/a |
| Monthly price (net) | 2 x (39.42 + 7.50) + 5.00 = **98.84 EUR**. Private node pool instead: + NAT Gateway 29.20 + NLB 14.60 + 2 IPs 10.00, about **148 EUR** | 2 x 17.52 + 5.00 = **40.04 EUR**. With ALB in front: + 14.60 + 5.00, about 60 EUR | 2 x (23.36 + 3.50) + 5.00 = **58.72 EUR** (4 vCPU / 8 GB like Cube M would be 50.22 EUR each) | Page shows only 3-month promo prices (2 to 17 EUR incl. VAT, 10 EUR setup); regular price not verified [11] | n/a |
| Scaling | Replicas per Deployment; node autoscaling between a set minimum and maximum, never to 0 [4]. Scaling `worker` by backlog needs an own metric (e.g. KEDA), not an IONOS feature | By hand: more containers per Cube or more Cubes. Template cannot be changed after creation; resize means recreate [6] | By hand; cores and RAM can be added to a running server (Live Vertical Scaling) [7]. VM Auto Scaling exists but is Early Access and "recommended for non-production critical applications" [8] | by hand | n/a |
| Rolling updates | Built in (Deployment rollout, rollback) | Own script; without a second instance behind a proxy or ALB each release has a short gap | same as Cubes | same as Cubes | n/a |
| Load balancer, public IPs | `Service` of type `LoadBalancer` is **not a real load balancer**: a static IP is put on one node, which acts as ingress node; 2 Gbit/s per node [5]. An ingress controller with TLS runs in the cluster. NLB/ALB can be wired by hand [5] | Reverse proxy (e.g. Caddy) on a Cube with a reserved IP, or managed ALB (HTTP rules, health checks) / NLB (TCP) in front, targets by private IP [13][14] | same as Cubes; ALB can be attached to an Auto Scaling group [8] | 1 IPv4 included; load balancer optional at extra cost [11] | n/a |
| Private networking | Node pools join private LANs of the virtual data center, more LANs can be attached [15], so nodes reach a managed database privately. Control plane endpoint is public, can be restricted by IP [4] | Private LAN in the virtual data center, same as any server | same | "Private network" inside that platform only [11]; no documented link into an IONOS Cloud virtual data center (not verified) | n/a |
| Registry | The image is public, so none needed. Private Container Registry exists (Frankfurt only) for own images [9] | same | same | none | n/a |
| Operator maintains alone | Manifests, ingress controller, certificates, keeping up with Kubernetes minor versions. IONOS: control plane, node replacement in the weekly window, forced move to the next minor at end of life [10] | Everything in the VM: OS patches, Docker, firewall, rollout, restarts, monitoring agent. IONOS: host only | same as Cubes | same as Cubes | n/a |
| Limits and catches | During maintenance nodes are replaced one by one (new node added first, old one drained; PodDisruptionBudgets tried, then ignored); "possible service interruption" stated [10]. One extra node is billed during a rebuild [15]. Recommended max 20 nodes per pool, 110 pods per node [16]. Private node pools: no `LoadBalancer` service, no static node IPs [16]. No IPv6 for Managed Kubernetes, ALB, NLB, NAT Gateway [17]. Node RAM minimum 2048 MB [18] | Disk is on the same physical host as the Cube; IONOS positions Cubes for workloads where "failover gets realized by the application and not the infrastructure" [2][6]. Suspended Cubes are still billed; a recreated Cube may get a new IP [6]. Cubes "may not be available" in some (legacy Frankfurt) data centers [2] | Up to 60 vCPUs / 230 GB RAM per server [7] | Location choice on the page reads "EU, USA und Grossbritannien"; Germany not confirmed [11] | n/a |

## Notes per topic

- **Why Kubernetes nodes need 8 GB:** Authentik (server and worker) and OpenBao run next to two `api` and two `worker` replicas, the ingress controller and the system pods. This sizing is an estimate, not measured.
- **Helper state:** OpenBao and Authentik are stateful. On Kubernetes their data belongs in the managed database or a block storage volume (CSI driver provided [4]); on a Cube it must not live only on the direct-attached NVMe disk without backup.
- **`cleanup`:** a Kubernetes CronJob, or a systemd timer / long-running container on a VM. No IONOS product is involved.
- **Certificates:** on Kubernetes cert-manager, on a VM the reverse proxy. Whether the Certificate Manager's automatic (ACME) certificates can be used on an ALB is unclear in the docs; only imported certificates are clearly documented for ALB [19].
- **Load balancer maintenance:** NLB, ALB and NAT Gateway have a weekly window, Monday 02:00 to 04:00 local time, interruption up to 5 seconds [2].
- **OpenShift and Rancher** are listed by IONOS but are far too heavy for one Operator; not assessed.

## Open points

- **Failover of the ingress IP on Managed Kubernetes:** the docs do not say what happens to the static IP when its node dies or is replaced in maintenance [5]. Test before launch, or put an NLB in front.
- **Locations of Managed Kubernetes:** the service catalog names locations for vCPU servers and Cubes (Berlin, Frankfurt 1 and 2) but not for Managed Kubernetes [2]. Assumed available in `de/fra` and `de/txl`; not verified.
- **Minimum cores per Kubernetes node** and whether public IPs of nodes are billed: not found in the docs. Only the RAM minimum is documented [18].
- **SLA figures:** the service catalog gives no availability percentage for any of these products [2]. The SLA document was not read.
- **Registry scanning:** the price list has a line "Vulnerability Scanning" (0.02 EUR per GB) [1], the registry overview says there is none [9]. Irrelevant while the image is public.
- **Docs index only partly read:** the index is very long; the Containers section was read, a "Serverless" section was not seen. The service catalog names only the AI Model Hub as serverless [2].
- **VPS:** regular prices, German location and API access not verified [11].
- **Default quotas of a new IONOS Cloud contract** (cores, RAM, IPs): not found.

## Sources

1. Price list IONOS CLOUD GmbH (DE), v2026-10-29: https://docs.ionos.com/cloud/support/general-information/price-list/ionos-cloud-gmbh-de
2. Service catalog: https://docs.ionos.com/cloud/support/general-information/service-catalog
3. Managed Kubernetes overview: https://docs.ionos.com/cloud/containers/managed-kubernetes/overview
4. Managed Kubernetes FAQ: https://docs.ionos.com/cloud/containers/managed-kubernetes/kubernetes-faq
5. Horizontal Scaling of Network Traffic: https://docs.ionos.com/cloud/containers/managed-kubernetes/use-cases/horizontal-scaling and Preserve Source IP: https://docs.ionos.com/cloud/containers/managed-kubernetes/use-cases/preserve-source-internet
6. Cubes overview: https://docs.ionos.com/cloud/compute-services/cubes/overview
7. Compute Engine overview and FAQ: https://docs.ionos.com/cloud/compute-services/compute-engine/overview , https://docs.ionos.com/cloud/compute-services/compute-engine/compute-engine-faq
8. VM Auto Scaling: https://docs.ionos.com/cloud/network-services/vm-auto-scaling (read through search result excerpts only)
9. Private Container Registry overview: https://docs.ionos.com/cloud/containers/private-container-registry/overview
10. Managed Kubernetes maintenance: https://docs.ionos.com/cloud/containers/managed-kubernetes/maintenance
11. VPS product page: https://www.ionos.de/server/vps
12. Documentation index: https://docs.ionos.com/cloud/llms.txt
13. Application Load Balancer overview: https://docs.ionos.com/cloud/network-services/application-load-balancer/overview
14. Network Load Balancer overview: https://docs.ionos.com/cloud/network-services/network-load-balancer/overview
15. Manage Node Pools: https://docs.ionos.com/cloud/containers/managed-kubernetes/how-tos/management-of-node-pools
16. Managed Kubernetes limitations: https://docs.ionos.com/cloud/containers/managed-kubernetes/overview/limitations
17. IPv6 limitations: https://docs.ionos.com/cloud/network-services/vdc-networking/ip-address/ipv6/overview/limitations (search result excerpt only)
18. Cloud API, create a Kubernetes node pool: https://docs.ionos.com/cloud/api-reference/cloud-api-v6/kubernetes/create-a-kubernetes-node-pool (search result excerpt only)
19. Certificate Manager: https://docs.ionos.com/cloud/security/certificate-manager/overview (search result excerpts only)
