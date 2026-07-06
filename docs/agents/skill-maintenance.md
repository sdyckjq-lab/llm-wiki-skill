# Skill Maintenance

Only read this document when maintaining the Skill package itself: `SKILL.md`, `install.sh`, `scripts/`, `templates/`, or `platforms/`.

The Skill package is mature and in maintenance freeze. Do not add new features here unless the user explicitly asks for Skill maintenance or a bug fix requires it.

## Entry Points

- Shared user-facing overview: [README.md](../../README.md)
- Core workflow: [SKILL.md](../../SKILL.md)
- Platform entries:
  - [Claude Code](../../platforms/claude/CLAUDE.md)
  - [Codex](../../platforms/codex/AGENTS.md)
  - [OpenClaw](../../platforms/openclaw/README.md)
  - [Hermes](../../platforms/hermes/README.md)

## Reference: Install Commands

These commands are reference-only during normal maintenance. Do not run them unless the user is installing llm-wiki, testing the installer, or the current change touches install behavior.

| Platform | Command |
|---|---|
| Claude Code | `bash install.sh --platform claude` |
| Codex | `bash install.sh --platform codex` |
| OpenClaw | `bash install.sh --platform openclaw` |
| Hermes | `bash install.sh --platform hermes` |

Default installs only the core knowledge-base workflow. If the task needs web / X / WeChat / YouTube / Zhihu extraction, add `--with-optional-adapters`.

For custom OpenClaw or Hermes skill directories, pass `--target-dir <your-skill-dir>/llm-wiki`.

## Reference: Workflow Order

This order describes how an installed Skill is used. Do not run the workflow during routine document maintenance unless the task is explicitly testing Skill behavior.

After installation, follow [SKILL.md](../../SKILL.md):

1. `init`
2. `ingest`
3. `batch-ingest`
4. `query`
5. `digest`
6. `lint`
7. `status`
8. `graph`

## Skill-Specific Checks

Before pushing Skill maintenance changes, choose checks by scope.

Always run:

```bash
bash install.sh --dry-run --platform codex
bash install.sh --dry-run --platform claude
grep -r '本机用户路径\|真实姓名\|私有素材路径' scripts/ templates/ tests/ SKILL.md
```

If changed scripts have `tests/fixtures/`, run the relevant fixture comparison.

For workflow text changes:

- Small single-workflow changes: create a test prompt file and run that workflow in Codex.
- Multi-workflow changes or version updates: run a full regression prompt covering `init -> ingest -> lint -> digest -> graph`.

Use local reusable test material outside the repository when available. Do not commit private material.

## Documentation Updates

Feature or behavior changes should update:

- [CHANGELOG.md](../../CHANGELOG.md)
- [README.md](../../README.md), if the user-facing feature list changes
- Version references, when the change is a release-worthy feature/fix

Pure documentation cleanup does not need a version bump.
