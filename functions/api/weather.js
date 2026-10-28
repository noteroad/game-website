const KMA_ENDPOINT = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0";

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const latitude = Number(url.searchParams.get("lat"));
  const longitude = Number(url.searchParams.get("lon"));

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return json({ error: "위치 좌표가 올바르지 않습니다." }, 400);
  }
  if (latitude < 32 || latitude > 40 || longitude < 123 || longitude > 133) {
    return json({ error: "현재는 대한민국 지역의 날씨만 지원합니다." }, 400);
  }
  if (!context.env.KMA_SERVICE_KEY) {
    return json({ error: "기상청 API 인증키가 설정되지 않았습니다." }, 503);
  }

  const { x, y } = toKmaGrid(latitude, longitude);
  const cacheKey = new Request(`${url.origin}/api/weather?nx=${x}&ny=${y}`);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const nowcastBase = koreaBaseTime(15, "00");
    const forecastBase = koreaBaseTime(45, "30");
    const [nowcast, forecast] = await Promise.all([
      fetchKma(context.env.KMA_SERVICE_KEY, "getUltraSrtNcst", nowcastBase, x, y),
      fetchKma(context.env.KMA_SERVICE_KEY, "getUltraSrtFcst", forecastBase, x, y),
    ]);
    const result = normalizeWeather(nowcast, forecast, x, y);
    const response = json(result, 200, { "Cache-Control": "public, max-age=300" });
    context.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    console.error("KMA weather request failed", error);
    return json({ error: "기상청 날씨를 불러오지 못했습니다." }, 502);
  }
}

async function fetchKma(serviceKey, method, base, x, y) {
  const params = new URLSearchParams({
    serviceKey,
    pageNo: "1",
    numOfRows: "1000",
    dataType: "JSON",
    base_date: base.date,
    base_time: base.time,
    nx: String(x),
    ny: String(y),
  });
  const response = await fetch(`${KMA_ENDPOINT}/${method}?${params}`);
  if (!response.ok) throw new Error(`KMA HTTP ${response.status}`);
  const data = await response.json();
  const header = data.response?.header;
  if (String(header?.resultCode) !== "00") throw new Error(header?.resultMsg || "KMA API error");
  return data.response?.body?.items?.item || [];
}

function normalizeWeather(nowcast, forecast, x, y) {
  const observed = Object.fromEntries(nowcast.map((item) => [item.category, item.obsrValue]));
  const nextForecast = [...forecast]
    .sort((a, b) => `${a.fcstDate}${a.fcstTime}`.localeCompare(`${b.fcstDate}${b.fcstTime}`));
  const forecastValues = {};
  for (const item of nextForecast) {
    if (!(item.category in forecastValues)) forecastValues[item.category] = item.fcstValue;
  }

  const precipitation = Number(observed.PTY ?? forecastValues.PTY ?? 0);
  const sky = Number(forecastValues.SKY ?? 1);
  let condition = "clear";
  if ([1, 4, 5].includes(precipitation)) condition = "rain";
  else if ([2, 3, 6, 7].includes(precipitation)) condition = "snow";
  else if (sky >= 3) condition = "cloudy";

  const koreaHour = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(new Date()));

  const temperature = Number(observed.T1H ?? forecastValues.T1H);
  if (!Number.isFinite(temperature)) throw new Error("KMA temperature data is missing");

  return {
    temperature,
    condition,
    precipitationType: precipitation,
    sky,
    isDay: koreaHour >= 6 && koreaHour < 18,
    observedAt: nowcast[0] ? `${nowcast[0].baseDate}T${nowcast[0].baseTime}` : null,
    grid: { x, y },
    source: "기상청",
  };
}

function koreaBaseTime(minutesAgo, fixedMinute) {
  const date = new Date(Date.now() - minutesAgo * 60 * 1000);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return { date: `${parts.year}${parts.month}${parts.day}`, time: `${parts.hour}${fixedMinute}` };
}

export function toKmaGrid(lat, lon) {
  const RE = 6371.00877;
  const GRID = 5;
  const SLAT1 = 30;
  const SLAT2 = 60;
  const OLON = 126;
  const OLAT = 38;
  const XO = 43;
  const YO = 136;
  const DEGRAD = Math.PI / 180;
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;
  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);
  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lon * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2 * Math.PI;
  if (theta < -Math.PI) theta += 2 * Math.PI;
  theta *= sn;
  return {
    x: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    y: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5),
  };
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}
