# AI Crew 선행 조사

2026년 11월 18일 기준. GitHub 저장소, 공식 문서, 논문을 바탕으로 에이전트가 함께 실제 일을 하는 작업공간을 조사했다. 수평성은 **상설 팀장 없이 각 에이전트가 일을 제안하거나 맡고, 동료에게 도움과 검토를 요청할 수 있는 권한**으로 해석했다. 전문 역할과 사람의 결재는 별개로 봤다. 비교는 공개 문서와 일부 소스 코드에 근거하며 설치, 실행, 논문 결과 재현은 조사 범위 밖이다.

## 핵심 발견

- **제품 경험은 EngChooN의 AI Office가 가깝다.** Claude Code와 Codex를 한 작업공간에서 운영하며 채팅, 업무 보드, 회의, 결재, 보고를 연결한다. 동료 도움 요청도 구현돼 있다. 큰 업무의 계획과 배정, 결과 취합은 팀·랩 리드가 맡는다. [AI Office 소개](https://engchoon.github.io/ai-office/), [v1.4.4 동료 도움 요청 코드](https://github.com/EngChooN/ai-office/blob/v1.4.4/app/src/main/office.ts#L2550-L2591), [계획 실행 코드](https://github.com/EngChooN/ai-office/blob/v1.4.4/app/src/main/office.ts#L3843-L3868)
- **수평적인 실행 구조는 Microsoft Agensh가 가장 가까운 선행 사례다.** 에이전트가 공유 공간에서 하위 업무를 찾아 맡고, 발견 사항을 공유하고, 결과를 검증·통합한다. Gitea와 Mattermost를 함께 쓰면서도 일감을 배분하는 중앙 에이전트를 두지 않는다. 수평적인 권한 구조는 단일 서버나 공유 보드와 양립할 수 있다. [Agensh GitHub](https://github.com/microsoft/Agensh), [Agensh 논문 §2](https://arxiv.org/html/2609.26781v1)
- **초기 조사에서는 동료의 자율 배정과 인계를 비교했다.** 공유 보드에서 일을 맡는 방식, 결과와 검토 근거를 남기는 방식, 막힌 업무를 동료에게 넘기는 방식을 살폈다. 동료 메시지나 사무실 화면 자체는 이미 여러 프로젝트에 있다. [OpenAgents 공유 이슈](https://github.com/openagents-org/openagents/tree/develop/workspace#shared-issues), [AgentLane](https://github.com/thetrueshags/AgentLane), [OpenClaw Office](https://github.com/wickedapp/openclaw-office)

## EngChooN AI Office

공유 링크는 앱 소개와 다운로드 페이지다. 11월 18일 공개 릴리스는 **v1.4.4**, 저장소 라이선스는 **MIT**다. 데스크톱 앱은 Electron, React, Phaser, SQLite를 쓰고, Claude Agent SDK와 Codex app-server를 통해 직원별 세션을 실행한다. [공식 사이트](https://engchoon.github.io/ai-office/), [한국어 README](https://github.com/EngChooN/ai-office/blob/v1.4.4/README.ko.md), [릴리스](https://github.com/EngChooN/ai-office/releases/tag/v1.4.4), [LICENSE](https://github.com/EngChooN/ai-office/blob/v1.4.4/LICENSE)

| 상황 | v1.4.4에서 확인한 동작 | AI Crew와 비교할 지점 |
|---|---|---|
| 보드 업무를 시작할 때 | 앱이 지정된 담당자에게 지시한다. 해당 직원이 다른 카드를 진행 중이면 그 직원의 대기열에 넣는다. 결과가 오면 카드를 검토로 옮긴다. [배정 코드](https://github.com/EngChooN/ai-office/blob/v1.4.4/app/src/main/office.ts#L3714-L3738), [보고 처리](https://github.com/EngChooN/ai-office/blob/v1.4.4/app/src/main/office.ts#L1697-L1718) | 담당자를 지정하는 흐름과 동료가 미배정 업무를 직접 맡는 흐름의 차이 |
| 큰 일을 나눌 때 | 리드가 `propose_plan`으로 하위 업무와 담당자를 올린다. 승인 후 앱이 앞 단계 결과를 다음 담당자에게 넘기며 순차 실행하고, 리드에게 취합을 맡긴다. [공식 명세 §6](https://github.com/EngChooN/ai-office/blob/v1.4.4/SPEC.md#6-040-2026-10-21-설치본-빌드), [계획 실행 코드](https://github.com/EngChooN/ai-office/blob/v1.4.4/app/src/main/office.ts#L3843-L3868) | 고정 리드의 분해·배정과, 여러 에이전트의 하위 업무 제안·선택의 차이 |
| 일하다 막혔을 때 | 가능한 도움 상대가 있는 직원은 `request_help`로 같은 팀·랩의 허용된 동료에게 요청할 수 있다. 요청을 활동과 채팅에 남기며, 완료 결과는 요청자에게 돌아간다. [대상 선택](https://github.com/EngChooN/ai-office/blob/v1.4.4/app/src/main/office.ts#L2479-L2489), [요청 처리](https://github.com/EngChooN/ai-office/blob/v1.4.4/app/src/main/office.ts#L2560-L2591), [결과 전달](https://github.com/EngChooN/ai-office/blob/v1.4.4/app/src/main/office.ts#L1712-L1719) | 이미 구현된 수평 협업이다. 도움 요청과 일감 소유권을 넘기는 인계를 따로 볼 수 있다. |
| 회의에서 할 일이 생길 때 | 회의록에서 할 일을 뽑는다. 진행자가 리드면 기획안에 쓸 결과 카드를 리드에게 주고, 그 외에는 개별 카드를 만들어 담당 제안을 채운다. 업무 시작은 보드에서 사람이 한다. [회의 종료 코드](https://github.com/EngChooN/ai-office/blob/v1.4.4/app/src/main/office.ts#L4352-L4378) | 토론, 결정 기록, 카드 생성, 실제 실행을 나눈 제품 흐름 |

제품에서 특히 참고할 점은 **대화방에서 실제 진행 상태를 보고, 결과가 돌아오면 보드의 검토 카드로 이어지는 흐름**이다. 사무실 화면의 캐릭터와 배치는 운영 상태를 읽기 쉽게 만드는 표현이다. 같은 화면 구조에서도 업무를 누가 가져가고 누가 완료를 확정하는지에 따라 협업 방식이 달라진다. [한국어 README](https://github.com/EngChooN/ai-office/blob/v1.4.4/README.ko.md), [공식 명세](https://github.com/EngChooN/ai-office/blob/v1.4.4/SPEC.md)

## AgentsRoom

2026년 11월 20일 공식 소개와 기능 문서를 확인했다. 아래 오른쪽 열은 AI Crew에 적용할 설계다. [한국어 소개](https://agentsroom.dev/ko)

| 운영 주제 | 공식 자료에서 확인한 동작 | AI Crew에 적용할 점 |
|---|---|---|
| 팀 실행과 계획 검토 | 팀 노드가 구조화된 인계를 넘기고, 수정 루프에서 기존 담당 세션을 이어 쓴다. 계획 내용에 의견을 달고 버전 간 차이를 읽을 수 있다. [Agent Teams](https://agentsroom.dev/features/teams), [Plan Review](https://agentsroom.dev/features/plan-review) | 업무와 단계 ID에 인계·조건 분기·검증을 연결하고 계획 버전별 승인과 수정 의견을 기록한다. |
| 쓰기 격리와 변경 추적 | 업무별 워크트리, 담당별 변경분, 한 줄 의견을 지원한다. 담당을 판별하기 어려운 경우 미귀속으로 남긴다. [Git Worktrees](https://agentsroom.dev/features/git-worktrees), [Per-Agent Review](https://agentsroom.dev/features/per-agent-review) | 격리는 Git 업무의 선택 사항으로 두고, 반영 결과와 검증 결과를 각각 기록한다. 버전과 근거를 기준으로 누가 무엇을 바꿨는지 추적한다. |
| 재개와 메시지 대기열 | 저장한 대기 메시지를 재실행 뒤에도 유지하고, 인계 문서로 새 모델 실행을 시작할 수 있다. [Message Queue](https://agentsroom.dev/features/message-queue), [Hand Over and Restart](https://agentsroom.dev/features/hand-over-and-restart) | 전송 대기와 업무 지시 버전을 보관하고, 원래 세션을 이어갈 수 없을 때 업무 체크포인트에서 복구한다. |
| 운영 상태와 알림 | 작업 완료·사용자 응답 필요 등의 신호를 알리고 에이전트가 만든 프로세스 상태를 보여준다. [알림](https://agentsroom.dev/features/agent-notifications), [전체 기능 문서](https://agentsroom.dev/features#monitoring) | 확정된 업무 사건으로 알림을 만들고, 소유한 실행의 정지 여부를 확인한다. |
| 도구·산출물 | 자체 MCP, 스킬 배정·호출, 로컬 산출물 열기를 제공한다. [AgentsRoom MCP](https://agentsroom.dev/features/agentsroom-mcp), [Agent Artifacts](https://agentsroom.dev/features/agent-artifacts), [전체 기능 문서](https://agentsroom.dev/features) | 기존 앱 MCP 실행기에 버전·권한·업무 소속을 연결하고, 보고와 로그에서 같은 산출물 기록을 연다. |

실행 동작과 검수 기준은 [업무 실행과 복구](execution.md)에 반영했다.

## 다른 GitHub 프로젝트와 도구

| 프로젝트 | 업무 조율 방식 | 참고할 부분과 범위 |
|---|---|---|
| **Microsoft Agensh** | 작업자들이 공유 맥락을 읽고 하위 업무를 자율적으로 선점한다. 메시지와 공유 저장소로 비동기 조율한다. | 전체 협업 루프와 사실·실패·선점·변경 요약을 남기는 공유 맥락. 공개 실험은 주로 소프트웨어 재구현이다. [GitHub](https://github.com/microsoft/Agensh), [논문 §2–3](https://arxiv.org/html/2609.26781v1) |
| **OpenAgents Workspace** | 채널·업무 보드·공유 이슈를 제공한다. 이슈에서 실행할 에이전트를 부르거나 업무를 배정하고, 능동형 스레드는 역할을 기준으로 실행자·검토자에게 전달한다. | 오래 남는 이슈, 실행 스레드, 검토 결과의 연결. 이슈를 등록하는 것과 에이전트를 실행하는 것이 별도 동작이다. [GitHub](https://github.com/openagents-org/openagents), [Workspace 문서](https://github.com/openagents-org/openagents/tree/develop/workspace#shared-issues) |
| **Paperclip** | 조직도, 보고 관계, 배정된 이슈, 실행 시점 관리, 예산과 승인 정책을 묶은 운영 플랫폼이다. | 이슈의 원자적 체크아웃, 비용 상한, 활동 이력. 에이전트 조직은 상하 보고 관계를 명시한다. [GitHub](https://github.com/paperclipai/paperclip) |
| **Beads** | 에이전트가 의존성이 풀린 업무를 조회하고 원자적으로 선점할 수 있다. 기존 담당 지정과 인계도 지원한다. | 작업 보드의 중복 선점 방지와 같은 요청을 재시도할 때의 처리. 일반 사무실 화면보다 개발 에이전트의 업무 상태 관리에 초점을 둔다. [GitHub](https://github.com/gastownhall/beads), [조율 문서](https://github.com/gastownhall/beads/blob/main/docs/multi-agent/coordination.md) |
| **AgentLane** | Git 보드에서 작업과 수정 경로를 선점한다. 별도 작업 브랜치에서 진행하며 정해진 검사와 검토를 거쳐 합친다. | 경로 중복 충돌, 작업자 중단 시 만료된 선점 회수, 결과 검증. 협업 대상이 Git 저장소인 경우에 특히 가깝다. [GitHub](https://github.com/thetrueshags/AgentLane) |
| **Claude Code Agent Teams** | 팀 리드가 팀과 공유 업무 목록을 만들고, 팀원은 직접 메시지를 주고받으며 업무를 선점할 수 있다. | 상설 리드가 있는 구조에서도 대화와 업무 선점 일부를 동료에게 넘긴 사례. 공식 문서상 실험 기능이다. [공식 문서](https://code.claude.com/docs/en/agent-teams) |
| **OpenClaw Office** | OpenClaw의 에이전트 상태와 위임 경로를 가상 사무실에 실시간으로 보여준다. | 화면에서 활동·위임·응답을 관찰하는 사례. 협업 규칙은 연결된 OpenClaw 실행 흐름을 따른다. [GitHub](https://github.com/wickedapp/openclaw-office) |
| **CrewAI** | `Sequential`로 고정 순서를 실행하거나 `Hierarchical`에서 매니저가 배정·검증한다. | 이름이 비슷한 대표 프레임워크. Crew와 역할을 선언하는 방식, 실행 순서를 결정하는 정책을 비교할 수 있다. [GitHub](https://github.com/crewAIInc/crewAI), [공식 프로세스 문서](https://docs.crewai.com/en/concepts/processes) |

## 관련 논문

| 논문 | 조사에서 확인한 내용과 적용 범위 |
|---|---|
| **Agensh: Scaling Organizational Intelligence to 1,024 Agents** (2026, arXiv 프리프린트) | 개인 실행 루프 위에 하위 업무 선점, 메시지, 저장소, 공유 맥락을 얹었다. 1,024명 수치는 Pandoc 재구현 실험의 규모다. 결과를 해석할 때 6시간 실행 제한과 소프트웨어 재구현이라는 과제 특성을 고려해야 한다. [논문](https://arxiv.org/abs/2609.26781), [실험 §3](https://arxiv.org/html/2609.26781v1) |
| **AgentNet: Decentralized Evolutionary Coordination for LLM-based Multi-Agent Systems** (NeurIPS 2025) | 각 에이전트가 라우터와 실행기를 갖고 방향성 비순환 그래프(DAG)에서 하위 업무를 분해·전달한다. 능력과 기억을 에이전트에 두고 가까운 동료에게 넘기는 구조다. 공유 보드에서 업무를 가져가는 Agensh와 함께 자율 배정 방식의 비교 사례다. [학회 논문](https://proceedings.neurips.cc/paper_files/paper/2025/hash/9a379c1b05793d1c42dc832269834515-Abstract-Conference.html), [GitHub](https://github.com/zoe-yyx/AgentNet) |
| **MetaGPT** (ICLR 2024), **ChatDev** (ACL 2024) | MetaGPT는 표준 작업 절차(SOP)에 따라 역할과 산출물을 연결한다. ChatDev는 설계·코딩·테스트·문서화 과정의 역할 간 대화를 정형화한다. 인계할 때 전달해야 할 정보와 결과물의 형식을 참고할 수 있다. [MetaGPT 논문](https://proceedings.iclr.cc/paper_files/paper/2024/hash/6507b115562bb0a305f1958ccc87355a-Abstract-Conference.html), [MetaGPT 코드](https://github.com/FoundationAgents/MetaGPT), [ChatDev 논문](https://aclanthology.org/2024.acl-long.810/), [ChatDev 코드](https://github.com/OpenBMB/ChatDev) |
| **Why Do Multi-Agent LLM Systems Fail?** (NeurIPS 2025) | MAST는 실패를 시스템 설계·명세, 에이전트 간 불일치, 검증·종료로 나눈다. 성공률에 더해 맥락이 어디서 유실됐고 누가 어떤 근거로 일을 끝냈는지 기록할 이유가 된다. [학회 논문](https://proceedings.neurips.cc/paper_files/paper/2025/hash/b1041e52d3be19f0a9bc491657488e4a-Abstract-Datasets_and_Benchmarks_Track.html), [데이터·코드](https://github.com/multi-agent-systems-failure-taxonomy/MAST) |
| **Towards a Science of Scaling Agent Systems** (2025 최초 공개, arXiv) | 단일 에이전트와 독립·중앙·분산·혼합 팀을 비교한다. 팀 구성의 효과는 업무의 병렬화 가능성, 조율 비용, 오류 전파에 따라 달라진다. AI Crew의 효과를 비교할 때 일감 유형과 실행 비용을 함께 기록할 근거다. [논문](https://arxiv.org/abs/2512.08296) |
| **TheAgentCompany** (NeurIPS 2025), **MultiAgentBench** (ACL 2025) | 전자는 모의 소프트웨어 회사에서 문서·코드·메시지 등 실제 업무에 가까운 과제를 제공한다. 후자는 다중 에이전트의 협업과 경쟁을 평가하며 중간 목표 달성도 측정한다. 업무 산출물과 협업 과정에 각각 적용할 평가 참고 자료다. [TheAgentCompany 논문](https://proceedings.neurips.cc/paper_files/paper/2025/hash/0d744742f6fac4d1134c019b7cef3c8a-Abstract-Datasets_and_Benchmarks_Track.html), [MultiAgentBench 논문](https://aclanthology.org/2025.acl-long.421/) |
| **DecArena: Evaluating Large-Scale Decentralized Multi-Agent Collaboration** (2026, arXiv 프리프린트) | 제한된 연결만 가진 에이전트가 네트워크에 흩어진 자원을 찾고 조합하는 능력을 인공 도구 호출 과제로 측정한다. 중앙 보드를 공유하는 팀보다 서로 볼 수 있는 정보와 도구가 다른 팀에 가까운 평가다. [논문과 한계](https://arxiv.org/html/2611.15521v1) |
| **The Contract Net Protocol** (IEEE Transactions on Computers, 1980) | 노드가 일을 공고하면 다른 노드가 응찰하고 공고자가 계약을 맡기는 고전적 분산 배정 방식이다. 공고자 역할은 업무마다 달라질 수 있다. 한 에이전트가 즉시 가져가는 선점에 비해 역량과 여유를 비교할 수 있고, 공고·응찰·선정 메시지가 필요하다. [저자 공개 원문](https://www.reidgsmith.com/The_Contract_Net_Protocol_Dec-1980.pdf) |
| **Generative Agents: Interactive Simulacra of Human Behavior** (UIST 2023) | Smallville에서 기억, 성찰, 계획을 가진 캐릭터들이 상호작용한다. 공간 UI와 에이전트 행동을 연결하는 선례로 볼 수 있다. 논문의 평가는 모의 사회적 행동을 다룬다. [저자 공개본](https://arxiv.org/abs/2304.03442) |

## 조사 당시 검토한 설계 선택지

이후 AI Crew는 비서가 배정을 조율하고 역할별 권한을 가진 동료들이 직접 도움과 검토를 요청하는 방식을 선택했다. 업무별 필수 검증을 통과하면 비서가 완료를 확정한다. [현재 제품 구상](concept.md)

- **누가 무엇을 맡나.** 짧고 분리 가능한 일에는 공유 보드의 카드 하나를 에이전트 한 명이 가져가는 선점 방식이 잘 맞는다. 드문 전문성이 필요한 일에서는 능력에 따라 도움을 요청하거나 응찰을 받는 방식도 있다. 카드에 담당자, 선행 업무, 완료 기준을 남기면 서로의 진행 상황을 알 수 있다. [Beads 조율 문서](https://github.com/gastownhall/beads/blob/main/docs/multi-agent/coordination.md), [Contract Net 논문](https://www.reidgsmith.com/The_Contract_Net_Protocol_Dec-1980.pdf)
- **동료가 어디까지 결정하나.** 예를 들어 에이전트 A가 자료 수집 카드를 맡고, B가 출처 검토 카드를 맡고, C가 둘의 결과로 보고서를 작성할 수 있다. 같은 권한으로 다른 과제에서는 역할을 바꿀 수 있다. 완료 판단의 근거는 채팅의 완료 메시지, 검토자의 판단, 실제 산출물 중 어디에 둘지 비교할 수 있다. 외부 발송처럼 사람의 결재가 필요한 동작에는 업무 검토와 별도 상태를 둘 수 있다. [OpenAgents 공유 이슈](https://github.com/openagents-org/openagents/tree/develop/workspace#shared-issues), [Paperclip](https://github.com/paperclipai/paperclip)
- **업무가 멈추면 어떻게 복구하나.** 중복 선점, 담당 에이전트 중단, 수정 요청 반복을 각각 살펴볼 수 있다. 누가 언제 업무를 맡았고 어떤 산출물과 근거를 남겼는지가 보이면, 다른 동료가 이어받을 때 필요한 맥락을 찾을 수 있다. [AgentLane](https://github.com/thetrueshags/AgentLane), [MAST 논문](https://arxiv.org/abs/2503.13657)
- **협업 효과를 어떻게 판단하나.** 같은 업무를 단일 에이전트, 팀장 배정, 동료 선점으로 수행하고, 공통 기준을 통과한 산출물의 비율과 사람 개입 횟수, 중복 작업, 완료 시간, 모델 비용을 비교할 수 있다. 병렬 처리 가능 여부에 따라 조율 방식의 효과가 달라지는지도 볼 수 있다. [스케일링 연구](https://arxiv.org/abs/2512.08296), [MultiAgentBench 논문](https://aclanthology.org/2025.acl-long.421/)
