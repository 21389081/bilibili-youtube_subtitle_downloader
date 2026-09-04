# Domain Docs

## Layout

This repository uses a **single-context** layout:

- `CONTEXT.md` at the repository root: domain concepts and glossary.
- `docs/adr/`: architecture decision records.

## Before exploring, read these

Read `CONTEXT.md` and the ADRs in `docs/adr/` relevant to the area being explored.

If these files do not exist, proceed silently. Do not flag their absence or suggest creating them upfront. The `/domain-modeling` skill creates them lazily when terms or decisions are actually resolved.

## Use the glossary's vocabulary

When naming a domain concept in an issue title, refactor proposal, hypothesis, or test name, use the term defined in `CONTEXT.md`. Avoid synonyms the glossary explicitly excludes.

If a concept is missing, reconsider whether it belongs to the project or note the gap for `/domain-modeling`.

## Flag ADR conflicts

If a proposal contradicts an existing ADR, identify the conflicting decision and explain why it may need to be revisited rather than silently overriding it.
