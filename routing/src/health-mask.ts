/**
 * What of a log line the health check's mail shows (#208): the example line with its IP
 * addresses and Agenda ids masked and cut to 300 characters, and the normalized message its
 * fingerprint is made of. Family ids stay in the example, so the Operator knows whose Family it
 * is. No I/O.
 */
import { isIPv6 } from "node:net";

/** The length the example line of a mail is cut to. */
export const EXAMPLE_LENGTH = 300;

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
/** What can be an IPv6 address, which isIPv6 then decides; an IPv4 one at its end included. */
const IPV6_CANDIDATE = /[0-9a-f:.]+/gi;

/**
 * Where a UUID is a Family id: the Routing module's `familyId` field, "Family <id>", a blob
 * location `…/families/<id>`, and the first segment of a path, as in `/<id>/api/agendas`.
 * Anywhere else, such as `/<Family id>/agendas/<id>`, it is an Agenda's or another id.
 */
const FAMILY_ID_BEFORE = /(?:familyId["']?\s*[:=]\s*["']?|\bFamily |\/families\/|(?:^|[\s"'=(])\/)$/;

const maskIpv6 = (candidate: string, offset: number, text: string): string => {
  let end = candidate.length;
  while (candidate[end - 1] === ".") end--;
  const address = candidate.slice(0, end);
  const alone = !/\w/.test(text.charAt(offset - 1)) && !/\w/.test(text.charAt(offset + candidate.length));
  return alone && isIPv6(address) ? `<ip>${candidate.slice(address.length)}` : candidate;
};

const maskIps = (text: string): string => text.replace(IPV6_CANDIDATE, maskIpv6).replace(IPV4, "<ip>");

/** Cuts the text to `length` characters, the last of them an ellipsis when it is cut. */
export const cut = (text: string, length = EXAMPLE_LENGTH): string => (text.length > length ? `${text.slice(0, length - 1)}…` : text);

/** The line as the mail shows it: IP addresses and every id but a Family id masked, cut to 300 characters. */
export const exampleOf = (line: string): string =>
  cut(maskIps(line).replace(UUID, (id: string, offset: number, text: string) => (FAMILY_ID_BEFORE.test(text.slice(0, offset)) ? id : "<id>")));

/**
 * The message as its fingerprint holds it: every id, address, number and hash masked, so that the
 * same error of another Family, at another time or of another process is the same message.
 */
export const normalize = (message: string): string =>
  cut(
    maskIps(message.replace(UUID, "<id>"))
      .replace(/\b0x[0-9a-f]+\b/gi, "<n>")
      .replace(/\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{8,}\b/gi, "<hex>")
      .replace(/\d+/g, "<n>"),
  );
