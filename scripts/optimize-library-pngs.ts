#!/usr/bin/env bun
/**
 * optimize-library-pngs — losslessly optimize library PNG images using ImageMagick
 * and verify pixel-perfect fidelity with compare -metric AE.
 *
 * @module scripts/optimize-library-pngs
 */
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export interface OptimizeOptions {
  dirs?: string[];
  dryRun?: boolean;
  concurrency?: number;
  verbose?: boolean;
}

export interface OptimizeFileResult {
  file: string;
  originalBytes: number;
  optimizedBytes: number;
  savedBytes: number;
  status: "optimized" | "already-optimal" | "error" | "mismatch";
  reason?: string;
}

export interface OptimizeSummary {
  totalFiles: number;
  optimizedFiles: number;
  alreadyOptimalFiles: number;
  errorFiles: number;
  originalTotalBytes: number;
  optimizedTotalBytes: number;
  savedTotalBytes: number;
  savedPercentage: number;
  results: OptimizeFileResult[];
}

function runCommand(cmd: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((res) => {
    const p = spawn(cmd, args);
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d.toString()));
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("close", (code) => res({ code: code ?? 0, stdout, stderr }));
    p.on("error", (err) => res({ code: -1, stdout, stderr: err.message }));
  });
}

function findPngFiles(dir: string): string[] {
  const pngs: string[] = [];
  const walk = (d: string) => {
    if (!existsSync(d)) return;
    for (const ent of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, ent.name);
      if (ent.isDirectory()) {
        walk(full);
      } else if (ent.isFile() && ent.name.toLowerCase().endsWith(".png")) {
        pngs.push(full);
      }
    }
  };
  walk(dir);
  return pngs.sort();
}

async function optimizeSingleFile(
  filePath: string,
  dryRun: boolean,
  convertBin: string,
  compareBin: string
): Promise<OptimizeFileResult> {
  const origSize = statSync(filePath).size;
  const tmpFile = join(tmpdir(), `opt-${Math.random().toString(36).slice(2)}.png`);

  try {
    const conv = await runCommand(convertBin, [
      filePath,
      "-strip",
      "-define",
      "png:compression-filter=5",
      "-define",
      "png:compression-level=9",
      "-define",
      "png:compression-strategy=1",
      tmpFile,
    ]);

    if (conv.code !== 0 || !existsSync(tmpFile)) {
      return {
        file: filePath,
        originalBytes: origSize,
        optimizedBytes: origSize,
        savedBytes: 0,
        status: "error",
        reason: conv.stderr.trim() || "convert failed",
      };
    }

    const nextSize = statSync(tmpFile).size;
    if (nextSize >= origSize) {
      return {
        file: filePath,
        originalBytes: origSize,
        optimizedBytes: origSize,
        savedBytes: 0,
        status: "already-optimal",
      };
    }

    const comp = await runCommand(compareBin, ["-metric", "AE", filePath, tmpFile, "null:"]);
    const compErr = comp.stderr.trim();
    const isExactMatch = comp.code === 0 && (compErr === "0" || compErr.startsWith("0 "));

    if (!isExactMatch) {
      return {
        file: filePath,
        originalBytes: origSize,
        optimizedBytes: origSize,
        savedBytes: 0,
        status: "mismatch",
        reason: `compare AE was not 0: ${compErr}`,
      };
    }

    const saved = origSize - nextSize;
    if (!dryRun) {
      copyFileSync(tmpFile, filePath);
    }

    return {
      file: filePath,
      originalBytes: origSize,
      optimizedBytes: nextSize,
      savedBytes: saved,
      status: "optimized",
    };
  } finally {
    try {
      if (existsSync(tmpFile)) unlinkSync(tmpFile);
    } catch {}
  }
}

export async function optimizeLibraryPngs(opts: OptimizeOptions = {}): Promise<OptimizeSummary> {
  const convertBin = existsSync("/opt/local/bin/convert") ? "/opt/local/bin/convert" : "convert";
  const compareBin = existsSync("/opt/local/bin/compare") ? "/opt/local/bin/compare" : "compare";

  const targetDirs =
    opts.dirs && opts.dirs.length > 0
      ? opts.dirs
      : [
          "cat-harness/library",
          "smart-base/library",
          "who-iris/library",
          "folio-assistant-core/library",
        ].filter((d) => existsSync(d));

  const allFiles: string[] = [];
  for (const d of targetDirs) {
    allFiles.push(...findPngFiles(resolve(d)));
  }

  const concurrency = opts.concurrency ?? 8;
  const dryRun = opts.dryRun ?? false;
  const verbose = opts.verbose ?? false;
  const results: OptimizeFileResult[] = [];

  let idx = 0;
  async function worker() {
    while (idx < allFiles.length) {
      const file = allFiles[idx++];
      if (!file) break;
      const res = await optimizeSingleFile(file, dryRun, convertBin, compareBin);
      results.push(res);
      if (verbose) {
        if (res.status === "optimized") {
          console.log(`[OPT] ${res.file}: ${res.originalBytes} -> ${res.optimizedBytes} (-${res.savedBytes} B)`);
        } else if (res.status === "already-optimal") {
          console.log(`[OK ] ${res.file}: already optimal (${res.originalBytes} B)`);
        } else {
          console.log(`[ERR] ${res.file}: ${res.status} (${res.reason})`);
        }
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  let origTotal = 0;
  let optTotal = 0;
  let savedTotal = 0;
  let optCount = 0;
  let alreadyCount = 0;
  let errCount = 0;

  for (const r of results) {
    origTotal += r.originalBytes;
    optTotal += r.optimizedBytes;
    savedTotal += r.savedBytes;
    if (r.status === "optimized") optCount++;
    else if (r.status === "already-optimal") alreadyCount++;
    else errCount++;
  }

  const savedPercentage = origTotal > 0 ? (savedTotal / origTotal) * 100 : 0;

  return {
    totalFiles: results.length,
    optimizedFiles: optCount,
    alreadyOptimalFiles: alreadyCount,
    errorFiles: errCount,
    originalTotalBytes: origTotal,
    optimizedTotalBytes: optTotal,
    savedTotalBytes: savedTotal,
    savedPercentage,
    results,
  };
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const verbose = argv.includes("--verbose");
  const dirs = argv.filter((a) => !a.startsWith("--"));

  console.log(`Scanning and optimizing library PNGs (dryRun=${dryRun})...`);
  const summary = await optimizeLibraryPngs({ dirs: dirs.length > 0 ? dirs : undefined, dryRun, verbose });

  console.log("\n--- Optimization Summary ---");
  console.log(`Total PNGs inspected:    ${summary.totalFiles}`);
  console.log(`Optimized (reduced):     ${summary.optimizedFiles}`);
  console.log(`Already optimal:         ${summary.alreadyOptimalFiles}`);
  console.log(`Errors / Mismatches:     ${summary.errorFiles}`);
  console.log(`Original total size:     ${(summary.originalTotalBytes / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`Optimized total size:    ${(summary.optimizedTotalBytes / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`Total saved:             ${(summary.savedTotalBytes / (1024 * 1024)).toFixed(2)} MB (${summary.savedPercentage.toFixed(1)}% reduction)`);
}
