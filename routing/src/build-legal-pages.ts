// `pnpm legal-pages`: builds the legal pages of site/ from site/legal/ and writes the footer into the landing pages.
import { siteDirectory, writeSite } from "./legal-site";

const site = siteDirectory();
const changed = writeSite(site);
process.stdout.write(changed.length === 0 ? `${site}: up to date\n` : changed.map((path) => `wrote ${path}\n`).join(""));
