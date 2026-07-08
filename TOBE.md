# can-i-merge

**Before you merge, ask one question.**

> can-i-merge?

AI-powered Git Review Pipeline with Intelligent Context Building.

---

# 1. 프로젝트 목표

`can-i-merge`는 Git 변경사항을 분석하여 AI가 코드 리뷰를 수행하는 CLI 기반 오픈소스 프로젝트이다.

이 프로젝트의 핵심은 AI 자체가 아니라 **AI에게 최적의 Context를 제공하는 Context Engine**이다.

AI Provider는 언제든 교체 가능해야 하며, Claude, GPT, Gemini, NVIDIA, Ollama 등을 동일한 인터페이스로 사용할 수 있어야 한다.

---

# 2. 핵심 철학

## AI는 핵심이 아니다.

좋은 리뷰는

> 좋은 AI

보다

> 좋은 Context

에서 나온다.

can-i-merge는 LLM에게 가장 적합한 Review Context를 생성하는 것을 가장 중요한 목표로 한다.

---

# 3. 프로젝트 목표

지원 기능

* Git Diff 분석

* AI Code Review

* Intelligent Context Building

* Provider 추상화

* Review Memory

* Incremental Review

* GitHub Action

* VSCode Extension

* MCP Server

---

# 4. 시스템 아키텍처

```text

Git Repository

        │

        ▼

Git Analyzer

        │

        ▼

Context Builder

 ├─ Dependency Resolver

 ├─ Context Score Engine

 ├─ Context Budget Engine

 ├─ Review Memory

 └─ Prompt Builder

        │

        ▼

Provider Layer

 ├─ Claude

 ├─ OpenAI

 ├─ NVIDIA

 ├─ Gemini

 ├─ Ollama

 └─ OpenRouter

        │

        ▼

Normalizer

        │

        ▼

ReviewResult

        │

        ▼

Reporter

```

---

# 5. Monorepo 구조

```text

can-i-merge/

packages/

│

├── cli/

│

├── core/

│

├── context-engine/

│

├── git/

│

├── prompt/

│

├── provider/

│

├── provider-anthropic/

│

├── provider-openai/

│

├── provider-nvidia/

│

├── normalizer/

│

├── reporter/

│

├── github-action/

│

├── vscode-extension/

│

├── mcp/

│

└── shared/

```

---

# 6. Core Engine

## Git Analyzer

입력

```

git diff

```

출력

```ts

interface GitChange {

file:string

status:"added"|"modified"|"deleted"

diff:string

}

```

지원

* HEAD

* HEAD~N

* Branch

* PR

* Staged

---

## Dependency Resolver

TypeScript AST 분석

지원

* import

* export

* interface

* type

* class

* extends

* implements

* decorator

Depth 탐색이 아닌

관련도 탐색

---

## Context Score Engine

각 파일의 중요도를 계산

예시

| File            | Score |

| --------------- | ----: |

| login.ts        |   100 |

| auth.service.ts |    95 |

| jwt.ts          |    82 |

| logger.ts       |    20 |

Score 계산

* Import 관계

* Symbol Reference

* AST Dependency

* Git Co-change

* 최근 수정 빈도

---

## Context Budget Engine

Depth 기반이 아니라

Budget 기반

```yaml

maxTokens:12000

maxFiles:15

reservedDiffTokens:3000

```

동작

```

Diff

↓

Changed Files

↓

Dependency

↓

Score Sort

↓

Budget

↓

Context

```

---

## Prompt Builder

Prompt 생성

순서

```

System Prompt

↓

Project Rules

↓

Review Type

↓

Known Issues

↓

Git Diff

↓

Changed Files

↓

Related Files

↓

Output Schema

```

---

# 7. Provider

Provider는 동일한 인터페이스를 구현한다.

```ts

interface ReviewProvider{

review(

context:ReviewContext

):Promise<RawReview>

}

```

지원

* Claude

* OpenAI

* NVIDIA

* Gemini

* Ollama

* OpenRouter

---

# 8. Normalizer

모든 Provider 출력을

동일한 형태로 변환

```ts

interface ReviewResult{

score:ReviewScore

issues:ReviewIssue[]

summary:string

stats:ReviewStats

}

```

---

# 9. Review Issue

```ts

interface ReviewIssue{

id:string

severity:

"critical"

|"high"

|"medium"

|"low"

category:

"security"

|"performance"

|"architecture"

|"style"

|"bug"

title:string

description:string

file:string

line:number

suggestion:string

confidence:number

provider:string

}

```

---

# 10. Review Memory

이전 리뷰 저장

예시

```

Commit A

↓

High

3

↓

Commit B

↓

새로운 문제만 보고

```

기능

* Known Issues

* Resolved Issues

* New Issues

* Regression

---

# 11. Consensus Engine (Phase 3)

```text

Claude

GPT

Gemini

↓

Consensus

↓

Confidence

```

공통으로 발견한 Issue

신뢰도 증가

---

# 12. CLI

```bash

can-i-merge

```

현재 Staged 리뷰

---

```bash

can-i-merge --commit HEAD

```

최근 Commit 리뷰

---

```bash

can-i-merge --provider claude

```

Provider 지정

---

```bash

can-i-merge --level fast

```

Review Level

---

```bash

can-i-merge --type security

```

Security 리뷰

---

```bash

can-i-merge --json

```

JSON 출력

---

```bash

can-i-merge --fix

```

향후 지원

---

# 13. Review Level

## Fast

Context

* Diff

* Changed Files

용도

* pre-push

---

## Normal

Context

* Dependency

용도

* CLI

---

## Deep

Context

* Dependency

* Config

* Schema

* Tests

* Review Memory

용도

* CI

---

# 14. Git Hook

## pre-commit

AI 사용 안 함

```

ESLint

↓

TS

↓

Tests

↓

Secret Scan

```

---

## pre-push

```

Fast Review

```

Critical 발견 시

Push 차단 가능

---

## GitHub Action

```

Deep Review

↓

PR Comment

```

---

# 15. 출력 예시

```text

can-i-merge v0.1.0

Analyzing Git Diff...

Building Context...

Reviewing with Claude...

──────────────────────────────────

Overall Score

92/100

Critical

0

High

1

Medium

2

Low

1

──────────────────────────────────

High

src/auth/login.ts:48

JWT 검증 전에 권한 확인이 수행됩니다.

Recommendation

권한 검증을 먼저 수행하세요.

──────────────────────────────────

Merge Status

❌ NOT READY

```

---

# 16. 구현 로드맵

## Phase 1 (MVP)

* CLI

* Git Analyzer

* Context Builder

* Prompt Builder

* Claude Provider

* Reporter

## Phase 2

* Context Budget

* Context Score

* OpenAI

* NVIDIA

* Ollama

* JSON Reporter

## Phase 3

* Review Memory

* Incremental Review

* GitHub Action

* VSCode Extension

## Phase 4

* Consensus Engine

* Auto Fix

* Dashboard

* MCP Server

---

# 17. 개발 원칙

* **Core는 Provider를 알지 못한다.**

* **Provider는 Context Builder를 알지 못한다.**

* **CLI는 Core만 호출한다.**

* **Provider 교체 시 Core 수정이 없어야 한다.**

* **ReviewResult는 모든 Provider에서 동일한 스키마를 보장한다.**

* **Context Builder는 토큰 예산(Budget)을 기준으로 동작하며, 깊이 제한만으로 판단하지 않는다.**

* **Git Diff는 항상 컨텍스트에 포함되는 최우선 정보이다.**