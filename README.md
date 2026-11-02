# 서부 및 남부 아시아 지리 뉴스(임송무)

서남·남부·중앙아시아와 코카서스 지역 뉴스를 지도 위에 주제별 색으로 보여 주는 정적 웹사이트입니다.

## 구조
- `index.html` : 배포되는 사이트 (build.js가 만든 결과물)
- `news.json` : 뉴스 데이터 (매일 자동 갱신 예정)
- `src/` : 사이트 원본 코드 (app.js 동작, app.css 디자인, body.html 화면 뼈대)
- `build.js` : `node build.js` → src + geo.json + news.json을 합쳐 dist/index.html 생성
- `geo.json` / `geo.py` : 지도 데이터와 생성 스크립트 (Natural Earth, 퍼블릭 도메인)

## 고지
- 기사 본문은 싣지 않으며, 제목·출처·날짜와 원문 링크만 제공합니다.
- 일부 요약·해설은 생성형 AI가 작성했습니다.
- 삭제 요청: a56500727@gmail.com
