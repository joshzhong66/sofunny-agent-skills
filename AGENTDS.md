# Sofunny Agent Skills Repository Rules

## Purpose

This file defines maintenance rules for the root skill directories in this repository.
It mainly governs skill folders such as `fill-feishu-inspection-records`, `generate-seedance-video`,
`generate-happyhorse-video`, and `signalflow-ai-search`.

## Root README synchronization

1. When adding a new skill, update the root `README.md` in the same change.
2. When renaming or deleting a skill, update the root `README.md`, any path references, and any related summaries in the same change.
3. Keep the root `README.md` as an index and short catalog only. Do not duplicate full `SKILL.md` content there.

## Required skill structure

1. Every skill directory must contain `SKILL.md`.
2. If the skill is intended to appear in UI skill lists or implicit invocation flows, include `agents/openai.yaml`.
3. Put deterministic execution logic in `scripts/`.
4. Put detailed reference material in `references/`.
5. Do not scatter core workflow knowledge across ad hoc files when it belongs in `SKILL.md`, `scripts/`, or `references/`.

## Naming and encoding

1. Skill directory names must use lowercase letters, digits, and hyphens only.
2. New or modified skill files must be saved as UTF-8.
3. Avoid PowerShell or editor flows that silently rewrite Chinese text into legacy encodings.
4. In `agents/openai.yaml`, `default_prompt` must explicitly reference `$skill-name`.

## Secrets and configuration

1. Do not hardcode sensitive credentials into the repository.
2. Prefer environment variables or example configuration files for secrets.
3. If a skill is bound to a specific external system, keep non-sensitive fixed configuration together in script defaults or `references/`, not half in scripts and half in README prose.

## Validation expectations

1. After adding or updating a skill, run at least one structure validation step such as `quick_validate.py`.
2. If the skill contains scripts, run at least one representative verification command such as:
   - `python -m py_compile ...`
   - `--help`
   - `--dry-run`
   - another non-destructive command that proves the script still works
3. If the skill talks to a live external system, prefer a non-destructive check first, then run a real execution only when needed and safe.

## Legacy and scope boundaries

1. Existing skill subdirectory `README.md` files are legacy and do not need to be removed just because this rule file now exists.
2. From now on, do not add a new per-skill `README.md` by default unless there is a clear repository-level documentation need.
3. These rules mainly apply to root skill directories.
4. App or service subprojects such as `Seedance_Studio` may keep their own `AGENTS.md`; when present, their local rules take precedence inside that subproject.
