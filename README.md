<h1 align="center">AI Crew</h1>

<p align="center">비서 한 명에게 요청하고, 에이전트 팀이 일하는 모습을 픽셀 아트 캠프에서 지켜보는 데스크톱 앱 구상.</p>

![AI Crew 캠프 콘셉트](docs/concept.png)

## 목업 실행

```sh
python3 -m http.server 48723 --bind 127.0.0.1 --directory demo
```

[브라우저에서 열기](http://127.0.0.1:48723/). 대화에서 예시 요청을 골라 보내면 플랜, 개발, 병렬 리뷰·스타일·테스트를 거쳐 결과를 받습니다. 폴더와 승인 모드는 보내기 줄에서, 세션은 상단 ☰에서 고릅니다. 메모리에서 공유 위키와 담당자 기억을 열고, 워크플로우에서 연결점을 끌어 단계 순서를 편집할 수 있습니다.

목업은 브라우저에서 실행을 모의합니다. 제품은 Electron과 로컬 SQLite로 프로젝트와 세션을 관리하고, 사용자가 고른 Codex와 로컬 LLM으로 실행할 계획입니다. [제품 구상](docs/concept.md) · [화면과 동작 명세](docs/interaction.md) · [구현 계획](docs/groove/PLAN.md) · [선행 조사](docs/research.md)

## 참고

1. EngChooN, AI Office, 2026. [GitHub](https://github.com/EngChooN/ai-office)
2. Microsoft Research, Agensh: Scaling Organizational Intelligence to 1,024 Agents, 2026. [논문](https://arxiv.org/abs/2609.26781), [코드](https://github.com/microsoft/agensh)
