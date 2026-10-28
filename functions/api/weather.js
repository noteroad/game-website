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
  const cacheKey = new Request(`${url.origin}/api/weather?v=2&nx=${x}&ny=${y}`);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const nowcastBase = koreaBaseTime(15, "00");
    const forecastBase = koreaBaseTime(45, "30");
    const villageBase = villageForecastBase();
    const [nowcast, forecast, villageForecast] = await Promise.all([
      fetchKma(context.env.KMA_SERVICE_KEY, "getUltraSrtNcst", nowcastBase, x, y),
      fetchKma(context.env.KMA_SERVICE_KEY, "getUltraSrtFcst", forecastBase, x, y),
      fetchKma(context.env.KMA_SERVICE_KEY, "getVilageFcst", villageBase, x, y, 2000),
    ]);
    const result = normalizeWeather(nowcast, forecast, villageForecast, x, y);
    const response = json(result, 200, { "Cache-Control": "public, max-age=300" });
    context.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    console.error("KMA weather request failed", error);
    return json({ error: "기상청 날씨를 불러오지 못했습니다." }, 502);
  }
}

async function fetchKma(serviceKey, method, base, x, y, numOfRows = 1000) {
  const params = new URLSearchParams({
    serviceKey,
    pageNo: "1",
    numOfRows: String(numOfRows),
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

function normalizeWeather(nowcast, forecast, villageForecast, x, y) {
  const observed = Object.fromEntries(nowcast.map((item) => [item.category, item.obsrValue]));
  const nextForecast = [...forecast]
    .sort((a, b) => `${a.fcstDate}${a.fcstTime}`.localeCompare(`${b.fcstDate}${b.fcstTime}`));
  const forecastValues = {};
  for (const item of nextForecast) {
    if (!(item.category in forecastValues)) forecastValues[item.category] = item.fcstValue;
  }

  const precipitation = Number(observed.PTY ?? forecastValues.PTY ?? 0);
  const sky = Number(forecastValues.SKY ?? 1);
  const condition = weatherCondition(precipitation, sky);

  const koreaHour = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(new Date()));

  const temperature = Number(observed.T1H ?? forecastValues.T1H);
  if (!Number.isFinite(temperature)) throw new Error("KMA temperature data is missing");

  const hourlyForecast = groupByForecastTime(forecast)
    .slice(0, 6)
    .map(({ date, time, values }) => ({
      date,
      time,
      temperature: finiteNumber(values.T1H),
      condition: weatherCondition(Number(values.PTY ?? 0), Number(values.SKY ?? 1)),
      isDay: Number(time.slice(0, 2)) >= 6 && Number(time.slice(0, 2)) < 18,
    }))
    .filter((item) => item.temperature !== null);

  const dailyForecast = summarizeDays(villageForecast);

  return {
    temperature,
    condition,
    precipitationType: precipitation,
    sky,
    isDay: koreaHour >= 6 && koreaHour < 18,
    hourlyForecast,
    dailyForecast,
    observedAt: nowcast[0] ? `${nowcast[0].baseDate}T${nowcast[0].baseTime}` : null,
    grid: { x, y },
    source: "기상청",
  };
}

function groupByForecastTime(items) {
  const groups = new Map();
  for (const item of items) {
    const key = `${item.fcstDate}${item.fcstTime}`;
    if (!groups.has(key)) groups.set(key, { date: item.fcstDate, time: item.fcstTime, values: {} });
    groups.get(key).values[item.category] = item.fcstValue;
  }
  return [...groups.values()].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
}

function summarizeDays(items) {
  const days = new Map();
  for (const slot of groupByForecastTime(items)) {
    if (!days.has(slot.date)) days.set(slot.date, []);
    days.get(slot.date).push(slot);
  }

  return [...days.entries()].slice(0, 5).map(([date, slots]) => {
    const temperatures = slots.map((slot) => finiteNumber(slot.values.TMP)).filter((value) => value !== null);
    const minValue = slots.map((slot) => finiteNumber(slot.values.TMN)).find((value) => value !== null);
    const maxValue = slots.map((slot) => finiteNumber(slot.values.TMX)).find((value) => value !== null);
    const conditions = slots.map((slot) => weatherCondition(
      Number(slot.values.PTY ?? 0),
      Number(slot.values.SKY ?? 1),
    ));
    const condition = ["snow", "rain", "cloudy", "clear"].find((value) => conditions.includes(value)) || "cloudy";
    const noon = slots.find((slot) => slot.time === "1200") || slots[Math.floor(slots.length / 2)];

    return {
      date,
      condition,
      temperatureMin: minValue ?? (temperatures.length ? Math.min(...temperatures) : null),
      temperatureMax: maxValue ?? (temperatures.length ? Math.max(...temperatures) : null),
      representativeTemperature: finiteNumber(noon?.values.TMP),
    };
  });
}

function weatherCondition(precipitation, sky) {
  if ([1, 4, 5].includes(precipitation)) return "rain";
  if ([2, 3, 6, 7].includes(precipitation)) return "snow";
  if (sky >= 3) return "cloudy";
  return "clear";
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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

function villageForecastBase() {
  const baseHours = new Set([2, 5, 8, 11, 14, 17, 20, 23]);
  const availableAt = new Date(Date.now() - 15 * 60 * 1000);
  for (let hoursAgo = 0; hoursAgo < 24; hoursAgo += 1) {
    const parts = koreaParts(new Date(availableAt.getTime() - hoursAgo * 60 * 60 * 1000));
    const hour = Number(parts.hour);
    if (baseHours.has(hour)) {
      return { date: `${parts.year}${parts.month}${parts.day}`, time: `${parts.hour}00` };
    }
  }
  throw new Error("Unable to determine KMA village forecast base time");
}

function koreaParts(date) {
  return Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
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
