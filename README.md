# DunDunGames Game Website

Google Play 개발자 웹사이트, 개인정보처리방침, 지원 페이지, AdMob `app-ads.txt`를 위한 무료 정적 홈페이지입니다.

## 파일 구조

```text
/
  index.html
  privacy.html
  support.html
  app-ads.txt
  lab/
    index.html
    weather-window/
      index.html
      styles.css
      app.js
  functions/
    api/weather.js
  worker.js
  wrangler.jsonc
  .assetsignore
  assets/
    css/styles.css
    js/main.js
    images/game-placeholder.svg
```

## 바꿔야 할 값 체크리스트

- `DunDunGames`: Google Play에 표시할 개발자명 또는 스튜디오명
- `WaveFit!`: 앱/게임 이름
- `dundunhada@gmail.com`: 지원 문의 이메일
- `dundungames.com`: 실제 사용할 도메인
- `[Google Play URL]`: Google Play 스토어 등록 후 생성되는 앱 URL
- `[pub-xxxxxxxxxxxxxxxx]`: AdMob Publisher ID

## AdMob app-ads.txt 수정 방법

현재 `app-ads.txt`에는 placeholder가 들어 있습니다.

AdMob에서 제공하는 실제 publisher ID를 확인한 뒤 아래 줄의 `pub-xxxxxxxxxxxxxxxx` 부분을 교체하세요.

```text
google.com, pub-xxxxxxxxxxxxxxxx, DIRECT, f08c47fec0942fa0
```

예시:

```text
google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0
```

배포 후 아래 주소에서 파일 내용이 보여야 합니다.

```text
https://dundungames.com/app-ads.txt
```

## 추천 배포 방식

추천 조합:

```text
GitHub 저장소 + Cloudflare Pages + 개인 도메인
```

Cloudflare Pages 설정값:

```text
Framework preset: None
Build command: 비워두기
Build output directory: /
Production branch: main
```

## 실험실과 기상청 날씨 설정

`/lab/`은 웹 프로젝트 목록이며 첫 프로젝트는 `/lab/weather-window/`입니다. 현재 날씨와 향후 6시간, 최대 5일의 간단한 예보를 제공합니다. 날씨 데이터는 Cloudflare Worker가 기상청 단기예보 API에서 받아오므로 인증키가 공개 저장소나 브라우저에 노출되지 않습니다. `worker.js`는 `/api/weather` 요청을 처리하고 다른 요청은 정적 사이트 자산으로 전달합니다.

1. [공공데이터포털 기상청 단기예보 조회서비스](https://www.data.go.kr/data/15084084/openapi.do)에서 활용 신청합니다.
2. 발급된 **일반 인증키(Decoding)** 값을 복사합니다.
3. Cloudflare Dashboard에서 `Compute → Workers & Pages → game-website → Settings → Bindings`로 이동합니다.
4. Production 환경에 `KMA_SERVICE_KEY`라는 이름의 Secret binding을 추가하고 인증키를 저장합니다.
5. 새 배포를 실행합니다.

인증키가 없으면 날씨 페이지는 깨지지 않고 도시 선택이 포함된 오류 상태를 표시합니다. 기상청 정보는 대한민국 영역만 지원하며, 동일 격자 응답은 5분간 캐시합니다.

## 초보자용 전체 배포 순서

1. GitHub 계정을 만듭니다.
2. 새 repository를 만듭니다.
3. 이 폴더의 파일을 GitHub repository에 업로드합니다.
4. Cloudflare 계정을 만듭니다.
5. Cloudflare Pages에서 GitHub repository를 연결합니다.
6. Cloudflare Pages가 제공하는 `*.pages.dev` 주소로 사이트가 열리는지 확인합니다.
7. 도메인을 구매합니다.
8. 도메인을 Cloudflare에 연결합니다.
9. Cloudflare Pages의 Custom domains에서 도메인을 사이트에 연결합니다.
10. Google Play Console에 개발자 웹사이트와 개인정보처리방침 URL을 입력합니다.
11. AdMob에서 Publisher ID를 확인한 뒤 `app-ads.txt`를 수정하고 다시 배포합니다.

## Google Play에 넣을 URL 예시

```text
Developer website: https://dundungames.com/
Privacy policy: https://dundungames.com/privacy.html
Support: https://dundungames.com/support.html
app-ads.txt: https://dundungames.com/app-ads.txt
```

## 개인정보처리방침 주의

`privacy.html`은 출시 준비용 초안입니다. 실제 앱에서 사용하는 SDK, 수집 데이터, 광고 방식, 분석 도구, 크래시 리포팅 도구, 인앱결제 상품에 맞게 수정해야 합니다.

계정 생성 기능을 추가하는 경우 `support.html`과 `privacy.html`에 계정 삭제 요청 방법을 반드시 추가하세요.
