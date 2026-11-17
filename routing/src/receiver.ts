import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import pg from "pg";
import { ConfigError, directoryConnection, type Config } from "./config";
import { createFamily } from "./create-family";
import { familyCreatedOf, SIGNATURE_HEADER, type FamilyCreated } from "./family-created";
import { reasonOf, type Log } from "./log";
import type { Resolve } from "./pool";
import { provisioning, ProvisioningError } from "./provisioning";
import { familySchedules, openQueues, type FamilySchedules } from "./scheduler";

/** The receiver, listening for the cores' `family.created`. */
export type Receiver = { url: string; close(): Promise<void> };

/** Where a core posts `family.created`: the path of its FAMILY_WEBHOOK_URL. */
export const RECEIVER_PATH = "/family-created";

/** More than any `family.created` has; a longer body is not read. */
const BODY_BYTES = 64 * 1024;

type ReceiverSetup = { config: Config; secret: string; directoryPool: pg.Pool; schedules: FamilySchedules; log: Log; resolve: Resolve | undefined };

/**
 * Starts the receiver: for each `family.created` a core signed with FAMILY_WEBHOOK_SECRET it
 * creates that Family, as `create` does for the Operator, and answers 2xx once the Family is
 * active with its schedules. The core posts it again until then, so a delivery that fails part-way
 * is finished by the next; one delivered again for an active Family changes nothing.
 */
export async function startReceiver(config: Config, log: Log, resolve?: Resolve): Promise<Receiver> {
  const secret = config.familyWebhookSecret;
  if (secret === null) throw new ConfigError("FAMILY_WEBHOOK_SECRET is not set");
  const boss = openQueues(config, { supervise: false, schedule: false, registerInstance: false, max: 2 });
  await boss.start();
  const directoryPool = new pg.Pool({ ...directoryConnection(config), max: 4 });
  directoryPool.on("error", (error) => {
    log.error("A connection to the Directory failed", { reason: reasonOf(error) });
  });
  const setup: ReceiverSetup = { config, secret, directoryPool, schedules: await familySchedules(boss), log, resolve };
  const server = createServer((incoming, outgoing) => {
    receive(setup, incoming, outgoing).catch((error: unknown) => {
      log.error("Receiving a delivery failed", { reason: reasonOf(error) });
      answer(outgoing, 500, { error: "failed" });
    });
  });
  await new Promise<void>((resolve) => server.listen(config.receiverPort, config.listenHost, resolve));
  const { address, port } = server.address() as AddressInfo;
  return {
    url: `http://${address.includes(":") ? `[${address}]` : address}:${port}`,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => { resolve(); }));
      await directoryPool.end();
      await boss.stop({ graceful: false });
    },
  };
}

async function receive(setup: ReceiverSetup, incoming: IncomingMessage, outgoing: ServerResponse): Promise<void> {
  const announced = await deliveryOf(setup, incoming);
  if ("status" in announced) {
    answer(outgoing, announced.status, { error: announced.error });
    return;
  }
  try {
    const address = await created(setup, announced);
    answer(outgoing, 200, { familyId: announced.familyId, address });
  } catch (error) {
    if (!(error instanceof ProvisioningError)) throw error;
    setup.log.error("Creating the registered Family was refused", { ...announced, error });
    answer(outgoing, 409, { error: "refused" });
  }
}

type Refusal = { status: number; error: string };

/** The Family a delivery announces, or how it is refused: not this path, too long, unsigned or malformed. */
async function deliveryOf({ secret, log }: ReceiverSetup, incoming: IncomingMessage): Promise<FamilyCreated | Refusal> {
  if (!isDelivery(incoming)) return { status: 404, error: "not-found" };
  const body = await bodyOf(incoming);
  if (body === undefined) return { status: 413, error: "too-large" };
  const announced = familyCreatedOf(body, signatureOf(incoming), secret);
  if (!("refused" in announced)) return announced;
  log.error("A delivery was refused", { reason: announced.refused });
  return { status: announced.refused === "unsigned" ? 401 : 400, error: announced.refused };
}

/** Whether the request is a POST to RECEIVER_PATH. */
function isDelivery(incoming: IncomingMessage): boolean {
  return incoming.method === "POST" && (incoming.url ?? "/").split("?")[0] === RECEIVER_PATH;
}

function signatureOf(incoming: IncomingMessage): string | undefined {
  const signature = incoming.headers[SIGNATURE_HEADER];
  return typeof signature === "string" ? signature : undefined;
}

/**
 * Creates the Family on a connection of its own: the lock that keeps two deliveries of it apart
 * is the session's. A connection whose work failed is not used again, as it may still hold it.
 */
async function created({ config, directoryPool, schedules, log, resolve }: ReceiverSetup, { familyId, organizationId }: FamilyCreated): Promise<string> {
  const client = await directoryPool.connect();
  try {
    const address = await createFamily({ ...provisioning(config, client, log, resolve), schedules }, { familyId, organizationId, familyIdFrom: "registration" });
    client.release();
    return address;
  } catch (error) {
    client.release(true);
    throw error;
  }
}

/** The request's body, or undefined for one longer than BODY_BYTES. */
async function bodyOf(incoming: IncomingMessage): Promise<Buffer | undefined> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of incoming as AsyncIterable<Buffer>) {
    length += chunk.length;
    if (length > BODY_BYTES) return undefined;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function answer(outgoing: ServerResponse, status: number, body: Record<string, unknown>): void {
  if (outgoing.headersSent) {
    outgoing.destroy();
    return;
  }
  outgoing.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
}
