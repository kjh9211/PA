<div align="center">

# can-i-merge

### Before you merge, ask one question.

> **can-i-merge?**

AI-powered Git review pipeline with intelligent context building.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#license)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](#)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green)](#)

</div>

---

## Why?

Most AI code review tools simply send your changed files to an LLM.

**can-i-merge** does something different.

Instead of asking:

> "Which AI should I use?"

It asks:

> **"What is the best context I can give the AI?"**

The AI is replaceable.

The **Context Engine** is the real product.

---

## Features

- Git Diff analysis
- Intelligent Context Builder
- Context Budget Engine
- Dependency-aware context collection
- Multiple AI providers
    - Claude
    - OpenAI
    - NVIDIA
    - Gemini
    - Ollama
    - OpenRouter
- Provider abstraction
- GitHub Action (Planned)
- VSCode Extension (Planned)
- MCP Server (Planned)
- Review Memory (Planned)

---

## Philosophy

Good AI reviews don't come from better models.

They come from better context.

```
Git Diff
      │
      ▼
Context Engine
      │
      ▼
Claude / GPT / Gemini / NVIDIA
      │
      ▼
Normalized Review
```

---

## Installation

```bash
npm install -g can-i-merge
```

---

## Usage

Review current changes

```bash
can-i-merge
```

Review latest commit

```bash
can-i-merge --commit HEAD
```

Deep review

```bash
can-i-merge --level deep
```

Choose AI provider

```bash
can-i-merge --provider claude
```

Security review

```bash
can-i-merge --type security
```

JSON output

```bash
can-i-merge --json
```

---

## Example

```text
$ can-i-merge

Analyzing Git Diff...
Building Context...
Reviewing with Claude...

────────────────────────────

Overall Score

92 / 100

Critical
0

High
1

Medium
2

Low
1

────────────────────────────

❌ Merge Status

NOT READY

────────────────────────────

High

src/auth/login.ts:48

JWT validation should happen after authorization.

Recommendation

Move authorization check before JWT validation.
```

---

# Architecture

```
                Git Repository
                       │
                       ▼
                Git Analyzer
                       │
                       ▼
               Context Builder
       ┌──────────────────────────┐
       │ Dependency Resolver      │
       │ Context Score Engine     │
       │ Context Budget Engine    │
       │ Prompt Builder           │
       │ Review Memory            │
       └──────────────────────────┘
                       │
                       ▼
                Provider Layer
       ┌──────────────────────────┐
       │ Claude                   │
       │ OpenAI                   │
       │ NVIDIA                   │
       │ Gemini                   │
       │ Ollama                   │
       └──────────────────────────┘
                       │
                       ▼
                  Normalizer
                       │
                       ▼
                  ReviewResult
```

---

# Why another AI review tool?

Most tools focus on the AI.

We focus on the context.

Instead of sending an entire repository to an LLM,
can-i-merge builds the smallest, most relevant context possible.

That means:

- Lower cost
- Faster reviews
- Better answers
- Model independence

---

# Roadmap

## v0.1

- CLI
- Git Diff Analyzer
- Context Builder
- Claude Provider
- Terminal Reporter

---

## v0.2

- Context Budget Engine
- Context Score Engine
- OpenAI Provider
- NVIDIA Provider
- Ollama Provider

---

## v0.3

- Review Memory
- Incremental Review
- GitHub Action
- VSCode Extension

---

## v1.0

- Multi AI Consensus
- MCP Server
- Dashboard
- Auto Fix
- Team Review

---

# Contributing

Contributions are welcome.

If you have ideas for improving the Context Engine,
please open an issue or submit a pull request.

---

# License

MIT License