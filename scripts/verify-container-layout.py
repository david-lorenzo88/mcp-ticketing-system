#!/usr/bin/env python3
"""
Pre-flight check for the Dockerfile, for when no Docker daemon is available.

Replays each stage into a real directory and performs the COPY instructions
literally, so a COPY whose source does not exist in the source stage fails here
in seconds instead of minutes into an `az acr build`. That is exactly the class
of bug that npm workspace hoisting causes: which workspaces get their own
nested node_modules is not stable, so a COPY naming one directly can start
failing without anything in this repo changing.

It implements only what this Dockerfile uses -- FROM/WORKDIR/ENV/RUN/COPY, plus
.dockerignore -- with Docker's semantics, notably that COPY of a directory
copies its CONTENTS into the destination rather than the directory itself. It
is a sanity check, not a Docker replacement: the real build is still the
authority.

    python3 scripts/verify-container-layout.py . /tmp/stages

Exits non-zero, listing every unresolved COPY source and failed RUN.
"""
import os, re, shutil, subprocess, sys, shlex, fnmatch
from pathlib import Path

CONTEXT = Path(sys.argv[1]).resolve()
ROOT    = Path(sys.argv[2]).resolve()
DOCKERFILE = CONTEXT / "Dockerfile"

# Join continuation lines, drop comments and blanks.
raw = DOCKERFILE.read_text().replace("\\\n", " ")
lines = [l.strip() for l in raw.splitlines()
         if l.strip() and not l.strip().startswith("#")]

stages, current, workdir, env = {}, None, "/app", {}
failures = []

# Honour .dockerignore, so the build context matches what Docker actually sends.
IGNORE = []
di = CONTEXT / ".dockerignore"
if di.exists():
    IGNORE = [l.strip() for l in di.read_text().splitlines()
              if l.strip() and not l.strip().startswith("#")]

def ignored(rel: str) -> bool:
    verdict = False
    for pat in IGNORE:
        neg = pat.startswith("!")
        p = pat[1:] if neg else pat
        p = p.removeprefix("**/")
        hit = (fnmatch.fnmatch(rel, p) or fnmatch.fnmatch(os.path.basename(rel), p)
               or any(fnmatch.fnmatch(seg, p) for seg in rel.split("/")))
        if hit:
            verdict = not neg
    return verdict

def copy_tree(origin: Path, target: Path, base: Path | None):
    """Copy origin's CONTENTS into target, skipping .dockerignore matches."""
    target.mkdir(parents=True, exist_ok=True)
    for item in origin.iterdir():
        rel = str(item.relative_to(base)) if base else ""
        if base and ignored(rel):
            continue
        dst = target / item.name
        if item.is_symlink():
            if dst.exists() or dst.is_symlink():
                dst.unlink()
            os.symlink(os.readlink(item), dst)
        elif item.is_dir():
            copy_tree(item, dst, base)
        else:
            if dst.exists():
                dst.unlink()
            shutil.copy2(item, dst)

def stage_dir(name): return ROOT / name
def resolve(stage, p):
    """Map an in-container absolute/relative path to the simulated stage dir."""
    p = p if p.startswith("/") else os.path.join(workdir, p)
    return stage_dir(stage) / os.path.normpath(p).lstrip("/")

for line in lines:
    verb, _, rest = line.partition(" ")
    verb = verb.upper()

    if verb == "FROM":
        m = re.search(r"\bAS\s+(\S+)", rest, re.I)
        current = m.group(1) if m else "final"
        workdir = "/app"
        shutil.rmtree(stage_dir(current), ignore_errors=True)
        stage_dir(current).mkdir(parents=True)
        print(f"\n### stage: {current}")

    elif verb == "WORKDIR":
        workdir = rest.strip()
        resolve(current, ".").mkdir(parents=True, exist_ok=True)

    elif verb == "ENV":
        for k, v in re.findall(r'(\w+)=("[^"]*"|\S+)', rest):
            env[k] = v.strip('"')

    elif verb == "COPY":
        parts = shlex.split(rest)
        src_stage = None
        if parts and parts[0].startswith("--from="):
            src_stage = parts[0].split("=", 1)[1]
            parts = parts[1:]
        *srcs, dest = parts
        dest_path = resolve(current, dest)
        dest_is_dir = dest.endswith(("/", ".")) or len(srcs) > 1

        for src in srcs:
            origin = (resolve(src_stage, src) if src_stage
                      else CONTEXT / src.lstrip("./"))
            if not origin.exists():
                where = f"stage '{src_stage}'" if src_stage else "build context"
                failures.append(f"COPY source missing in {where}: {src}")
                print(f"  ✗ COPY {src} -> {dest}   MISSING in {where}")
                continue

            if origin.is_dir():
                # Docker copies a directory's CONTENTS into the destination.
                copy_tree(origin, dest_path, CONTEXT if src_stage is None else None)
            else:
                target = dest_path / origin.name if dest_is_dir else dest_path
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(origin, target, follow_symlinks=False)
            print(f"  ✓ COPY {src} -> {dest}")

    elif verb == "RUN":
        if rest.startswith("apk ") or "chmod" in rest or "chown" in rest:
            print(f"  · skip RUN {rest[:60]}")
            continue
        print(f"  → RUN {rest[:70]}")
        r = subprocess.run(rest, shell=True, cwd=resolve(current, "."),
                           env={**os.environ, **env}, capture_output=True, text=True)
        if r.returncode != 0:
            failures.append(f"RUN failed in {current}: {rest[:60]}")
            print("    stderr:", r.stderr[-600:])

print("\n" + "=" * 62)
if failures:
    print("FAILURES:")
    for f in failures: print("  -", f)
    sys.exit(1)
print("All stages executed; every COPY source resolved.")
