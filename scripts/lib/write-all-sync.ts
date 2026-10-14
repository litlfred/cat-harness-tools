/**
 * Write ALL of a string to a file descriptor, synchronously.
 *
 * `fs.writeSync` is one `write(2)`: on a pipe whose read end is slow it writes
 * what the pipe buffer takes (64 KiB on Linux) and returns that count, or
 * throws `EAGAIN` when the descriptor is non-blocking and the buffer is full.
 * A caller that ignores the count and then calls `process.exit` delivers a
 * truncated document and exits 0. `kg-audit --json` did exactly that: piped
 * into a parent (the `resolution-across-needs` tests, `Bun.spawn` with
 * `stdout: "pipe"`), its 900 KB report arrived as the first 65,536 bytes, and
 * the parent's `JSON.parse` failed with "Unterminated string". Redirected to a
 * FILE the same run was complete, which is why it read as flaky rather than
 * wrong.
 *
 * @module scripts/lib/write-all-sync
 */
import { writeSync } from "node:fs";

/** How long to yield when the descriptor reports `EAGAIN`, in milliseconds. */
const BACKOFF_MS = 2;

/**
 * Write every byte of `text` (UTF-8) to `fd`, retrying partial writes and
 * `EAGAIN` until the whole buffer is out. Any other error is thrown.
 *
 * @returns the number of bytes written, which is always the buffer's length
 */
export function writeAllSync(fd: number, text: string): number {
  const buf = Buffer.from(text, "utf-8");
  const pause = new Int32Array(new SharedArrayBuffer(4));
  let off = 0;
  while (off < buf.length) {
    try {
      off += writeSync(fd, buf, off, buf.length - off);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EAGAIN") throw e;
      Atomics.wait(pause, 0, 0, BACKOFF_MS);
    }
  }
  return buf.length;
}
