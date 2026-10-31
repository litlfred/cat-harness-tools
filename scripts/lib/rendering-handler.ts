/**
 * The request handler behind `serve-rendering.ts`, written against the web
 * standard `Request` and `Response` only, so the same code runs under Bun
 * today and under a small Node launcher later (owner, 2026-10-31: "B. Bun +
 * Node-portable core"). Nothing here touches the `Bun` global; a launcher
 * passes in what its runtime does better (`inferType`, `openBody`).
 *
 * ## Several sites on one origin, the way Pages lays them out
 *
 * GitHub Pages serves every litlfred repository from one origin, each under
 * `/<repo>/`. A local server that served one site at `/` would put every
 * root-relative link and every IRI path one level off. So the handler takes a
 * list of {@link Mount}s, each a URL prefix and the directory behind it, and
 * the longest matching prefix wins. A `gh-pages` checkout mounted at
 * `/<repo>` serves its `STAGING/<branch>/` previews with no extra rule,
 * because they are ordinary subdirectories.
 *
 * ## What it copies from Pages, because links depend on it
 *
 * - `<dir>` without a trailing slash redirects to `<dir>/`, so relative links
 *   inside the directory index resolve against the directory.
 * - `/page` serves `page.html` when no `page` exists (Jekyll's pretty URLs).
 * - A miss serves the mount's own `404.html`, with status 404, when it has one.
 *
 * ## One origin, not two
 *
 * `localhost` and `127.0.0.1` are different origins, so cookies, storage and
 * service workers split between them. With `canonicalHost` set, a request
 * that names `localhost` or `[::1]` is redirected to the canonical host on the
 * same port, so a browser only ever stores state for one of them.
 *
 * Issue: litlfred/cat-harness-tools#1163 (local server Phase 1).
 *
 * @module scripts/lib/rendering-handler
 */
import { createReadStream, existsSync, realpathSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { Readable } from "node:stream";

import { renderingMediaType } from "../../schemas/kg/cat-harness.js";
import { resolveWithin, safeSegment } from "../../src/core/safe-path";

/** One site: the URL prefix it is served under and the directory behind it. */
export interface Mount {
  /** `/` or `/<segment>[/<segment>…]`, no trailing slash. */
  prefix: string;
  /** The built site directory. */
  dir: string;
}

export interface HandlerOptions {
  mounts: readonly Mount[];
  /** Redirect `localhost` and `[::1]` requests to this host (e.g. `127.0.0.1`). */
  canonicalHost?: string;
  /** The runtime's own media-type guess for a file the declaration says nothing about. */
  inferType?: (file: string) => string | undefined;
  /** The runtime's best way to send a file. Defaults to a Node read stream. */
  openBody?: (file: string) => BodyInit;
}

/** Hosts that are loopback under another name, and so another origin. */
const LOOPBACK_ALIASES = new Set(["localhost", "[::1]", "::1"]);

/**
 * Normalise and validate mounts: each prefix segment must be a safe single
 * segment, and the longest prefix comes first so it wins the match.
 * Throws on a bad prefix, since a mount that cannot match is a typo.
 */
export function normalizeMounts(mounts: readonly Mount[]): Mount[] {
  const out = mounts.map(({ prefix, dir }) => {
    const segs = prefix.split("/").filter((s) => s.length > 0);
    for (const s of segs) {
      if (safeSegment(s) === undefined) throw new Error(`serve-rendering: bad mount prefix: ${prefix}`);
    }
    return { prefix: segs.length ? `/${segs.join("/")}` : "/", dir: resolve(dir) };
  });
  const seen = new Set<string>();
  for (const m of out) {
    if (seen.has(m.prefix)) throw new Error(`serve-rendering: mount prefix given twice: ${m.prefix}`);
    seen.add(m.prefix);
  }
  return out.sort((a, b) => b.prefix.length - a.prefix.length);
}

/** The mount a path falls under, and the path inside it (always starting `/`). */
export function matchMount(mounts: readonly Mount[], pathname: string): { mount: Mount; rest: string } | undefined {
  for (const mount of mounts) {
    if (mount.prefix === "/") return { mount, rest: pathname };
    if (pathname === mount.prefix || pathname.startsWith(`${mount.prefix}/`)) {
      return { mount, rest: pathname.slice(mount.prefix.length) || "/" };
    }
  }
  return undefined;
}

/**
 * The file a request resolves to, applying the directory-index rule and the
 * containment check that needs the filesystem.
 *
 * **The real path is what is compared, so a symlink cannot escape.** Found by
 * this module's own test, which pointed a link inside the root at a file
 * outside it and got **200** from the first version: `resolve()` is string
 * arithmetic, so the lexical check sees a clean path and the escape happens
 * entirely in the filesystem.
 *
 * Returns `undefined` when nothing is there, so the caller owns the 404.
 */
export function resolveFile(root: string, urlPath: string): string | undefined {
  const real = realTarget(root, urlPath);
  if (!real) return undefined;
  if (statSync(real).isDirectory()) {
    const index = join(real, "index.html");
    return existsSync(index) ? index : undefined;
  }
  return real;
}

/** The contained real path a URL path names, file or directory, or undefined. */
function realTarget(root: string, urlPath: string): string | undefined {
  const target = resolveWithin(root, urlPath);
  if (!target || !existsSync(target)) return undefined;
  const base = realpathSync(resolve(root));
  let real: string;
  try {
    real = realpathSync(target);
  } catch {
    // A broken symlink: not servable, and not an error worth distinguishing from absent.
    return undefined;
  }
  if (real !== base && !real.startsWith(base + sep)) return undefined;
  return real;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** The page at `/` when nothing is mounted there: a list of what is. */
function mountIndex(mounts: readonly Mount[]): Response {
  const items = [...mounts]
    .sort((a, b) => a.prefix.localeCompare(b.prefix))
    .map((m) => `<li><a href="${escapeHtml(m.prefix)}/">${escapeHtml(m.prefix)}/</a></li>`)
    .join("\n");
  const html = `<!doctype html>\n<html lang="en"><meta charset="utf-8"><title>Local sites</title>\n<h1>Local sites</h1>\n<ul>\n${items}\n</ul>\n</html>\n`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function defaultBody(file: string): BodyInit {
  return Readable.toWeb(createReadStream(file)) as unknown as ReadableStream;
}

/** Build the handler. Pure apart from reading the mounted directories. */
export function createRenderingHandler(opts: HandlerOptions): (req: Request) => Response {
  const mounts = normalizeMounts(opts.mounts);
  for (const m of mounts) {
    if (!existsSync(m.dir)) throw new Error(`serve-rendering: no such directory: ${m.dir}`);
  }
  const openBody = opts.openBody ?? defaultBody;

  const send = (file: string, status: number, head: boolean): Response => {
    const type = renderingMediaType(file) ?? opts.inferType?.(file);
    return new Response(head ? null : openBody(file), {
      status,
      headers: type ? { "Content-Type": type } : undefined,
    });
  };

  return (req: Request): Response => {
    const url = new URL(req.url);

    if (opts.canonicalHost && LOOPBACK_ALIASES.has(url.hostname)) {
      const port = url.port ? `:${url.port}` : "";
      return Response.redirect(`${url.protocol}//${opts.canonicalHost}${port}${url.pathname}${url.search}`, 308);
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      return new Response("Method not allowed\n", { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    const head = req.method === "HEAD";

    const hit = matchMount(mounts, url.pathname);
    if (!hit) {
      if (url.pathname === "/") return mountIndex(mounts);
      return new Response("Not found\n", { status: 404 });
    }
    const { mount, rest } = hit;

    // A directory named without its slash: redirect, as Pages does, so the
    // index's relative links resolve against the directory.
    if (!url.pathname.endsWith("/")) {
      const real = realTarget(mount.dir, rest);
      if (real && statSync(real).isDirectory()) {
        return Response.redirect(`${url.origin}${url.pathname}/${url.search}`, 301);
      }
    }

    const file = resolveFile(mount.dir, rest) ?? (rest.endsWith("/") ? undefined : resolveFile(mount.dir, `${rest}.html`));
    if (file) return send(file, 200, head);

    const notFound = resolveFile(mount.dir, "/404.html");
    if (notFound) return send(notFound, 404, head);
    return new Response("Not found\n", { status: 404 });
  };
}
