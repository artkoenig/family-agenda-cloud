# IONOS VPS as the starting platform

Research for [#63](https://github.com/artkoenig/family-agenda-cloud/issues/63), map [#46](https://github.com/artkoenig/family-agenda-cloud/issues/46). Researched 2026-11-12. Documentation reading only; no order was placed and the Cloud Panel was not opened. Builds on `ionos-compute.md`, `ionos-postgres-object-storage.md`, `ionos-platform-services.md` and `ionos-ai-model-hub.md`, which are not repeated here.

## Question

Can the hosted service start on one IONOS VPS (ionos.de hosting product, managed in the Cloud Panel) running everything self-run with Docker Compose (`api`, `worker`, `cleanup`, PostgreSQL with one database per Family, OpenBao, Authentik, Caddy), with all Family content at IONOS in Germany? What does it cost, what do contract and AVV say, and how does it move to IONOS Cloud (DCD) later? Compared with one Basic Cube M.

## Short answer

- **Technically yes.** VPS L+ (4 vCPU / 8 GB / 240 GB NVMe) meets the ~4 vCPU / 8 GB floor; VPS XL+ (8 vCPU / 16 GB / 480 GB) gives headroom. Unlimited traffic at 1 Gbit/s, 1 IPv4 and a /80 IPv6 included, Cloud Panel firewall, private network, images with schedule, optional Acronis backup.
- **Regular price** (struck-through price after the 3-month promo, incl. VAT): L+ **22 EUR** (18.49 EUR net), XL+ **41 EUR** (34.45 EUR net), plus a one-time setup fee of 10 EUR. Promo: 7 / 12 EUR for 3 months.
- **Against one Basic Cube M** (17.52 EUR + 5 EUR IP = **22.52 EUR net**) the VPS L+ saves about **4 EUR/month net**. That is the whole price advantage.
- **Different company and contract.** VPS: IONOS SE under the hosting AGB, server AGB and AVV v1.4; consumers allowed. IONOS Cloud (Cubes, Object Storage, AI Model Hub): IONOS CLOUD GmbH, separate AGB, no consumers. The AI Model Hub and IONOS Cloud Object Storage need the IONOS Cloud contract anyway, so a VPS start means **two contracts, two AVVs, two consoles**.
- **Germany only partly confirmed.** The server AGB say the VPS data centre is chosen at order and cannot be changed later. A 2023 IONOS press release names Berlin and Frankfurt; the current product page only says "EU, USA und Großbritannien". The VPS sub-processor list names **Arsys Internet S.L.U. (Logroño, Spain)** for "Kundensupport und Betrieb der Plattformen vServer (VPS), Cloud Server ... Dedicated Server". The AVV promises EU/EEA, not Germany. Storage can be in Germany, but operation and support of the platform come from an IONOS group company in Spain.
- **No managed move to DCD.** Cloud Panel images are bound to their data centre and there is no documented export. IPs belong to the Cloud Panel data centre. The move is by hand: create a Cube in DCD, restore from your own backups, switch DNS, cancel the VPS.
- **Availability and failure:** the product page claims "> 99,99 % Verfügbarkeit", but the AGB only commit to 99 % annual average for servers, and give no VPS figure and no credits. The FAQ says a vServer usually runs on one physical machine. What happens on host failure is not documented. Backups are the customer's duty (AGB 10.4, 10.10).

**Recommendation:** do not start on the VPS. Start on one Basic Cube M (or Memory Cube M, 23.36 EUR) in DCD with the same Docker Compose setup. It costs about 4 EUR/month more and is billed per minute with no setup fee and no minimum term. It sits on the target platform under the one IONOS Cloud contract that the AI Model Hub needs anyway. It is Terraform-managed, and later it can reach managed PostgreSQL in a private LAN without a migration. Take the VPS only if the IONOS Cloud contract is not available, for example because a business is not yet registered.

## Prices

From the product page [1], prices incl. 19 % VAT; net values calculated here.

| Plan | vCPU / RAM / disk | Promo, first 3 months | Regular (struck-through) | Regular net | Setup fee |
|---|---|---|---|---|---|
| VPS S+ | 1 / 2 GB / 60 GB NVMe | 2 EUR | 5 EUR | 4.20 EUR | 10 EUR |
| VPS M+ | 2 / 4 GB / 120 GB NVMe | 4 EUR | 12 EUR | 10.08 EUR | 10 EUR |
| **VPS L+** | 4 / 8 GB / 240 GB NVMe | 7 EUR | **22 EUR** | **18.49 EUR** | 10 EUR |
| VPS XL+ | 8 / 16 GB / 480 GB NVMe | 12 EUR | 41 EUR | 34.45 EUR | 10 EUR |
| VPS XXL+ | 12 / 24 GB / 720 GB NVMe | 17 EUR | 59 EUR | 49.58 EUR | 10 EUR |

| Extra | Price | Source |
|---|---|---|
| Additional IPv4 | 5 EUR/month | [1] |
| Backup (Acronis) | "ab 6 Cent pro GB/Monat" | [1] |
| Plesk | 5 EUR/month (not needed) | [1] |
| Traffic | unlimited, up to 1 Gbit/s | [1] |
| High-Speed-Images (point-in-time copy) | no price on the page | [1] |

- The page footnote reads "Angebote sind nur für begrenzte Zeit gültig und sind teils abhängig von Mindestvertragslaufzeiten" and gives no term [1]. The hosting AGB set a default minimum term of 12 months, renewing indefinitely, with 1 month notice, "unless otherwise agreed" for the product (§5.3) [3]. The page offers cancellation within 30 days with full refund [1].
- Billing per server AGB: VPS monthly base fee in advance plus variable usage after the fact (3.3.5); VPS+ initial VM monthly in advance, further VMs per minute on a 30-day basis (3.7.5); the initial VPS+ VM can only be removed by cancelling the whole contract (3.7.1) [4].
- Price changes: for non-consumers at least 4 weeks' notice, cost-based at most once a year (§6.3, §6.5) [3]. IONOS raised VPS prices for existing customers in 2026 by e-mail; affected customers may cancel at once [5].

## Comparison with one Basic Cube M

| | VPS L+ (ionos.de, Cloud Panel) | Basic Cube M (IONOS Cloud, DCD) |
|---|---|---|
| Size | 4 vCPU / 8 GB / 240 GB NVMe [1] | 4 vCPU / 8 GB / 240 GB NVMe (`ionos-compute.md`) |
| Price net | 18.49 EUR/month + 10 EUR setup incl. VAT; IPv4 included [1] | 17.52 EUR (730 h) + 5.00 EUR reserved IP = **22.52 EUR**; no setup fee; per minute [7] |
| Term | not stated; hosting AGB default 12 months unless the product says otherwise [3] | none; cancel any time, effective the next working day (AGB 3.4) [8] |
| Contracting entity | IONOS SE, Montabaur [3] | IONOS CLOUD GmbH, Montabaur [8] |
| Consumers | allowed (AGB distinguish consumers and businesses) [3] | excluded ("Nicht teilnahmeberechtigt sind Verbraucher im Sinne des § 13 BGB") [8] |
| AVV | AVV v1.4, Stand 10/2026, part of the AGB; EU/EEA (§4.3); sub-processors incl. Arsys (ES) for VPS operation and support [9][10] | AVV for IONOS Cloud v7.4 (`ionos-platform-services.md`) |
| German data centre | chosen at order, cannot be changed (server AGB 3.3.1) [4][2]; Berlin and Frankfurt named in 2023 [6]; current page: "EU, USA und Großbritannien" [1] | Berlin `de/txl`, Frankfurt `de/fra`, `de/fra/2` (`ionos-compute.md`) |
| Availability | page: "> 99,99 %" [1]; AGB: servers 99 % annual average (§2.1) [3]; server AGB: no VPS figure [4] | no figure for Cubes in the service catalog (`ionos-compute.md`) |
| Disk / host failure | NVMe; "vServer usually runs on a single physical machine" (FAQ) [1]; failure handling not documented | NVMe on the same host as the Cube (`ionos-compute.md`) |
| API / IaC | Cloud Panel API `cloudpanel-api.ionos.com/v1`, documented for Cloud Server and Dedicated Server [11][12]; VPS coverage and Terraform provider not found | Cloud API v6, Terraform provider `ionos-cloud/ionoscloud` (`ionos-platform-services.md`) |
| Managed PostgreSQL reachable | no; DBaaS sits in a DCD private LAN (`ionos-postgres-object-storage.md`) | yes, in the same LAN |
| Same contract as AI Model Hub / Object Storage | no | yes |

## Features of the VPS

| Topic | Finding | Source |
|---|---|---|
| Platform | Press release 2023: VPS on "der selbst entwickelten IONOS Cloud-Plattform". FAQ: the vServer uses the same platform as the cloud product "with a somewhat reduced feature set". Still a separate product with its own console (Cloud Panel). | [6][1] |
| Snapshots / images | Images are "eine Sicherungskopie Ihres Servers", used to restore or clone; automatic image creation at regular intervals; the server cannot be edited while an image is taken. No price or count found. | [13][14] |
| Image scope | "you can use your own images only in the IONOS data center in which they were created". No export or download is documented. | [15] |
| Backup | Acronis Cloud Backup, "ab 6 Cent pro GB/Monat"; Acronis Germany GmbH is the sub-processor. The AGB put backups on the customer: "IONOS ist nicht verpflichtet, Datensicherungen vorzunehmen" (server AGB 2.1.1); daily off-server backups (AGB 10.4). | [1][4][3][10] |
| Block storage | SSD of chosen size, one server at a time, must be in the same data centre as the server. No price found. | [16] |
| Firewall | Cloud Panel firewall policies, inbound rules only; defaults open only required ports. IPv6 not mentioned. | [17] |
| Private network | VPS+ can create private networks per data centre in the Cloud Panel. No price; no link to DCD LANs documented. | [18][1] |
| IPv4 / IPv6 | 1 IPv4 and one /80 IPv6 included; extra IPv4 5 EUR/month; an IP is tied to a data centre. | [1][19] |
| Load balancer | Cloud Panel load balancer for VPS+; cannot hold SSL certificates. | [20] |
| Port 25 | blocked by default, can be opened via a help-centre procedure. | [20] |
| Object Storage in the Cloud Panel | The Cloud Panel offers an S3 "Object Storage" for VPS+ (up to 500 buckets, 5 access keys, object lock, lifecycle). Regions, endpoint names, price and contract are not stated. | [20] |
| Restrictions | no crypto mining, fair use, no open relays; resources cannot be shared across cloud contracts. Nothing on offering services to third parties. | [4] |

## Using IONOS Cloud services from a VPS

- **IONOS Cloud Object Storage:** reachable over public endpoints (`s3.eu-central-3.ionoscloud.com` Berlin, `s3.eu-central-4.ionoscloud.com` Frankfurt), so a VPS can use it with an access key (`ionos-postgres-object-storage.md`). The hosting AGB of IONOS SE exclude "Enterprise Cloud / IaaS, S3 Object Storage und Managed Kubernetes" (§1.1) [3], so it is a separate product under IONOS CLOUD GmbH terms. Free egress applies only "to IONOS services in the same data center or country"; whether traffic from a Cloud Panel VPS counts is not documented.
- **AI Model Hub:** public endpoint `openai.inference.de-txl.ionos.com` with an IONOS Cloud token, offered only to businesses (`ionos-ai-model-hub.md`). It needs the IONOS Cloud contract.
- The Cloud Panel's own Object Storage might replace the IONOS Cloud bucket under the IONOS SE contract. Whether it is the same service, which regions it has, and its price are not verified.

## Migration path VPS -> IONOS Cloud (DCD)

1. No documented tool. Cloud Panel images cannot leave their data centre [15]. DCD accepts uploaded images over FTP(S) per location (vmdk, vhd/vhdx, qcow2, raw; MBR boot only, no UEFI) [21], but no Cloud Panel export exists to feed it. IONOS's own migration guide for this platform is "Websites manuell auf einen neuen Server migrieren" [20].
2. **IPs are not portable.** The help centre ties an IP to a data centre [19]. When IONOS migrated old Cloud Servers to the new platform, only IPv4 from the same data centre was kept and IPv6 was replaced [22]. That was an IONOS-run move inside the Cloud Panel, not a move to DCD.
3. **Separate contract.** IONOS Cloud is a contract with IONOS CLOUD GmbH under its own AGB [8]. Whether it can share the login of an ionos.de customer account is not verified.
4. **By hand, which is cheap for this stack:** open the IONOS Cloud contract, create a Cube or Kubernetes in `de/fra` or `de/txl` with Terraform, restore PostgreSQL (dump or base backup plus WAL, kept in IONOS Cloud Object Storage from day one), OpenBao and Authentik data, lower the DNS TTL, cut over, cancel the VPS. Keep the backups in IONOS Cloud Object Storage from the start, so the restore source already sits on the target platform.
5. **Middle steps:** "Cloud Server" on ionos.de is now the IONOS Cloud Cube in DCD: Basic Cube M 0.024 EUR/h = 17.28 EUR per 30 days, per-minute billing, "Keine Mindestvertragslaufzeit" [23]. It is not a middle step but the target itself. Dedicated Servers in the Cloud Panel are another hosting product of the same kind as the VPS and add nothing here; not assessed further.

## Fit for the stack

- 8 GB for PostgreSQL (100 small databases), Authentik server and worker (with Redis), OpenBao, Caddy, `api`, `worker` and `cleanup` is workable at start but tight; this is an estimate, not measured. XL+ (16 GB, 34.45 EUR net) or Memory Cube M (16 GB, 23.36 EUR net) for headroom.
- One machine means a single point of failure for everything, including the self-run database. That fits "best effort, no on-call" only with tested off-host backups.
- OpenBao unseal after each reboot or host move stays an open decision (`ionos-platform-services.md`).

## Not verified

- That a German data centre (and which one) can be chosen today for Linux VPS+ on ionos.de, and at what surcharge. Check in the order process.
- That the struck-through prices are the prices after the 3-month promo; the page does not label them.
- Minimum term and notice period of VPS+; whether the hosting AGB default of 12 months applies.
- Price and count limit of images/snapshots, block storage and private networks for VPS+.
- Whether the Cloud Panel API covers VPS+, and whether any Terraform provider covers the Cloud Panel. The API docs page returned 401.
- Host failure behaviour (automatic restart elsewhere or not) for VPS+.
- IPv6 in firewall policies.
- Which Object Storage the Cloud Panel offers (regions, endpoint, price, contract), and whether traffic from a VPS to IONOS Cloud Object Storage is free.
- Whether an ionos.de customer account and an IONOS Cloud contract share one login.
- The content of the AVV TOM annex [9]; only the sub-processor list was read.

## Sources

1. VPS product page: https://www.ionos.de/server/vps (first 100,000 characters read; Windows VPS page https://www.ionos.de/server/windows-vps gives the same terms)
2. Create a server (VPS+), data centre chosen under "Rechenzentrum" without a list of names: https://www.ionos.de/hilfe/server-cloud-infrastructure/serveradministration-migrierte-cloud-server-und-vps-plus/server-erstellen-vps-plus/
3. AGB IONOS SE: https://www.ionos.de/terms-gtc/terms/ ; overview of terms: https://www.ionos.de/terms-gtc/
4. Server AGB: https://www.ionos.de/terms-gtc/terms-server/
5. VPS price adjustment 2026: https://www.ionos.com/help/2026/vps-information-on-the-2026-price-adjustment/
6. Press release 2023-06-28, "IONOS VPS auf neuer Plattform": https://www.ionos.de/newsroom/news/ionos-vps-auf-neuer-plattform-mehr-performance-und-besseres-preis-leistungsverhaeltnis/
7. Price list IONOS CLOUD GmbH (DE), via `ionos-compute.md`: https://docs.ionos.com/cloud/support/general-information/price-list/ionos-cloud-gmbh-de
8. AGB IONOS CLOUD GmbH: https://cloud.ionos.de/terms-gtc/
9. AVV IONOS SE, v1.4, Stand 10/2026: https://www.ionos.de/terms-gtc/avv/ ; TOM: https://www.ionos.de/terms-gtc/fileadmin/pdf/terms-gtc/DE/AVV/DE_AVV_TOM_v1.0.pdf
10. AVV Anhang 2, sub-processors, v4.5, Stand 04/2026: https://www.ionos.de/terms-gtc/fileadmin/pdf/terms-gtc/DE/AVV/IONOS_DPA_Annex2_SubProcessor_List_DE.pdf
11. Cloud Server API general information: https://www.ionos.co.uk/help/server-cloud-infrastructure/cloud-panel-management/api/cloud-server-api-general-information/
12. Cloud Panel API documentation: https://cloudpanel-api.ionos.com/documentation (overview only; the full reference returned 401)
13. Images overview: https://www.ionos.de/hilfe/server-cloud-infrastructure/images-vps/uebersicht-images-migrierte-cloud-server-vps-und-vps-plus/
14. Create an image: https://www.ionos.de/hilfe/server-cloud-infrastructure/images-vps/image-erstellen-vps-plus-und-migrierte-cloud-server/
15. Images general information: https://ionos.ca/help/server-cloud-infrastructure/images/images-general-information
16. Block Storage general information: https://www.ionos.de/hilfe/server-cloud-infrastructure/block-storage/block-storage-allgemeine-informationen/
17. Firewall policies: https://www.ionos.de/hilfe/server-cloud-infrastructure/firewall-vps/uebersicht-firewall-richtlinien-vps-migrierte-cloud-server-und-vps-plus/
18. Create a private network: https://www.ionos.de/hilfe/server-cloud-infrastructure/netzwerk-migrierte-cloud-server/vps-plus-und-migrierte-cloud-server-privates-netzwerk-erstellen/
19. Public IP overview: https://www.ionos.de/hilfe/server-cloud-infrastructure/ip-adressen-migrierte-cloud-server/uebersicht-oeffentliche-ip-vps-migrierte-cloud-server-und-vps-plus/
20. Help centre section "VPS+ und migrierte Cloud Server" (article list; Object Storage general information, load balancer, port 25, migration guide): https://www.ionos.de/hilfe/server-cloud-infrastructure/vps-und-migrierte-cloud-server/ ; https://www.ionos.de/hilfe/server-cloud-infrastructure/object-storage-migrierte-cloud-server-und-vps-plus/object-storage-allgemeine-informationen/
21. DCD image upload via FTP: https://docs.ionos.com/cloud/backup-and-storage/images-snapshots/private-images/how-tos/upload-image-via-ftp (search result excerpts only)
22. Technical migration of Cloud Servers to the new platform: https://www.ionos.de/hilfe/server-cloud-infrastructure/akkordeons-zu-cloud-server/allgemeine-informationen/technische-migration-von-cloud-server-zur-neuen-plattform/
23. Cloud Server product page (Cubes): https://www.ionos.de/server/cloud-server
