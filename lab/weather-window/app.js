const ui = {
  window: document.querySelector("#window"), card: document.querySelector("#weather-card"),
  location: document.querySelector("#location"), title: document.querySelector("#weather-title"),
  description: document.querySelector("#description"), temperature: document.querySelector("#temperature"),
  fallback: document.querySelector("#fallback-panel"), fallbackMessage: document.querySelector("#fallback-message"),
  cityForm: document.querySelector("#city-form"), citySelect: document.querySelector("#city-select"),
  retryLocation: document.querySelector("#retry-location"),
  forecastPanel: document.querySelector("#forecast-panel"),
  hourlyList: document.querySelector("#hourly-list"), weeklyList: document.querySelector("#weekly-list"),
  playForecast: document.querySelector("#play-forecast"), playLabel: document.querySelector("#play-label"),
};

const CITIES = {
  seoul: { name: "서울", latitude: 37.5665, longitude: 126.978 },
  busan: { name: "부산", latitude: 35.1796, longitude: 129.0756 },
  incheon: { name: "인천", latitude: 37.4563, longitude: 126.7052 },
  daegu: { name: "대구", latitude: 35.8714, longitude: 128.6014 },
  daejeon: { name: "대전", latitude: 36.3504, longitude: 127.3845 },
  gwangju: { name: "광주", latitude: 35.1595, longitude: 126.8526 },
  gangneung: { name: "강릉", latitude: 37.7519, longitude: 128.8761 },
  jeju: { name: "제주", latitude: 33.4996, longitude: 126.5312 },
};

const COPY = {
  clear: { day: ["맑은 하늘이에요", "햇살이 창가에 머물고 있어요."], night: ["맑은 밤이에요", "고요한 밤하늘이 펼쳐져 있어요."] },
  cloudy: { day: ["구름이 머물러요", "부드러운 구름이 하늘을 덮고 있어요."], night: ["구름 낀 밤이에요", "구름 사이로 밤빛이 은은하게 보여요."] },
  rain: { day: ["비가 내리고 있어요", "창문에 빗방울이 조용히 흐르고 있어요."], night: ["비 내리는 밤이에요", "어두운 창가에 빗소리가 내려앉아요."] },
  snow: { day: ["눈이 내리고 있어요", "하얀 눈송이가 천천히 내려와요."], night: ["눈 내리는 밤이에요", "밤하늘 아래 눈송이가 반짝여요."] },
};

const ICONS = { clear: "☀", cloudy: "☁", rain: "☂", snow: "❄" };
const REGIONS = [
  ["서울", 37.5665, 126.978], ["부산", 35.1796, 129.0756], ["대구", 35.8714, 128.6014],
  ["인천", 37.4563, 126.7052], ["광주", 35.1595, 126.8526], ["대전", 36.3504, 127.3845],
  ["울산", 35.5384, 129.3114], ["세종", 36.48, 127.289], ["경기", 37.2636, 127.0286],
  ["강원", 37.8813, 127.73], ["충북", 36.6424, 127.489], ["충남", 36.601, 126.6608],
  ["전북", 35.8242, 127.148], ["전남", 34.8161, 126.463], ["경북", 36.5684, 128.7294],
  ["경남", 35.2279, 128.6811], ["제주", 33.4996, 126.5312],
];
let currentPlaceName = "현재 위치";
let weatherData = null;
let playbackToken = 0;

function setLoading(text = "현재 위치를 찾는 중") {
  stopPlayback();
  ui.card.setAttribute("aria-busy", "true");
  ui.window.dataset.weather = "loading";
  ui.location.textContent = text;
  ui.title.textContent = "잠시, 창밖을 불러올게요";
  ui.description.textContent = "기상청에서 지금의 하늘을 확인하고 있어요.";
  ui.temperature.innerHTML = "--<span>°</span>";
  ui.forecastPanel.hidden = true;
}

async function fetchWeather(place) {
  setLoading(`${place.name}의 하늘을 확인하는 중`);
  ui.fallback.hidden = true;
  const params = new URLSearchParams({ lat: place.latitude, lon: place.longitude });
  const response = await fetch(`/api/weather?${params}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Weather request failed");
  renderWeather(place.name, data);
}

function renderWeather(placeName, data) {
  const temperature = Number(data.temperature);
  if (!Number.isFinite(temperature)) {
    throw new Error("기온 정보가 올바르지 않습니다.");
  }
  currentPlaceName = placeName;
  weatherData = data;
  renderScene({
    label: `${placeName} · ${data.isDay ? "낮" : "밤"}`,
    condition: data.condition,
    isDay: data.isDay,
    temperature,
  });
  renderForecastControls();
  ui.card.setAttribute("aria-busy", "false");
}

function renderScene({ label, condition, isDay, temperature, description }) {
  const weather = COPY[condition] ? condition : "cloudy";
  const time = isDay ? "day" : "night";
  const [title, defaultDescription] = COPY[weather][time];
  ui.window.dataset.weather = weather;
  ui.window.dataset.time = time;
  ui.location.textContent = label;
  ui.title.textContent = title;
  ui.description.textContent = description || defaultDescription;
  ui.temperature.innerHTML = `${Math.round(temperature)}<span>°</span>`;
  ui.temperature.setAttribute("aria-label", `기온 섭씨 ${Math.round(temperature)}도`);
}

function renderForecastControls() {
  ui.hourlyList.replaceChildren();
  ui.weeklyList.replaceChildren();

  for (const hour of weatherData.hourlyForecast || []) {
    const hourText = `${hour.time.slice(0, 2)}시`;
    ui.hourlyList.append(createForecastButton({
      className: "hour-button",
      label: hourText,
      icon: weatherIcon(hour.condition, hour.isDay),
      detail: `${Math.round(hour.temperature)}°`,
      onClick: (button) => {
        stopPlayback();
        selectForecastButton(button);
        renderHour(hour);
      },
    }));
  }

  for (const day of weatherData.dailyForecast || []) {
    const min = Number(day.temperatureMin);
    const max = Number(day.temperatureMax);
    const representative = Number.isFinite(Number(day.representativeTemperature))
      ? Number(day.representativeTemperature)
      : Number.isFinite(max) ? max : Number.isFinite(min) ? min : weatherData.temperature;
    const range = Number.isFinite(min) && Number.isFinite(max)
      ? `최저 ${Math.round(min)}° · 최고 ${Math.round(max)}°`
      : "기온 정보 준비 중";
    ui.weeklyList.append(createForecastButton({
      className: "day-button",
      label: formatShortDate(day.date),
      icon: weatherIcon(day.condition, true),
      ariaLabel: `${formatFullDate(day.date)}, ${conditionName(day.condition)}, ${range}`,
      onClick: (button) => {
        stopPlayback();
        selectForecastButton(button);
        renderScene({
          label: `${currentPlaceName} · ${formatFullDate(day.date)}`,
          condition: day.condition,
          isDay: true,
          temperature: representative,
          description: range,
        });
      },
    }));
  }

  ui.forecastPanel.hidden = !(ui.hourlyList.children.length || ui.weeklyList.children.length);
  ui.playForecast.hidden = !ui.hourlyList.children.length;
  ui.playLabel.textContent = "미리 보기";
}

function renderHour(hour) {
  const hourText = `${hour.time.slice(0, 2)}시`;
  renderScene({
    label: `${currentPlaceName} · ${formatFullDate(hour.date)} ${hourText}`,
    condition: hour.condition,
    isDay: hour.isDay,
    temperature: hour.temperature,
    description: `${hourText}에 예상되는 창밖 풍경이에요.`,
  });
}

async function playHourlyForecast() {
  const hours = weatherData?.hourlyForecast || [];
  if (!hours.length) return;
  const token = ++playbackToken;
  ui.playForecast.classList.add("is-playing");
  ui.playForecast.setAttribute("aria-pressed", "true");
  ui.playLabel.textContent = "재생 중";
  const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 650 : 1250;

  for (let index = 0; index < hours.length; index += 1) {
    if (token !== playbackToken) return;
    const button = ui.hourlyList.children[index];
    selectForecastButton(button);
    renderHour(hours[index]);
    await new Promise((resolve) => window.setTimeout(resolve, delay));
  }

  if (token === playbackToken) {
    ui.playForecast.classList.remove("is-playing");
    ui.playForecast.setAttribute("aria-pressed", "false");
    ui.playLabel.textContent = "다시 보기";
  }
}

function stopPlayback() {
  playbackToken += 1;
  if (!ui.playForecast) return;
  ui.playForecast.classList.remove("is-playing");
  ui.playForecast.setAttribute("aria-pressed", "false");
  ui.playLabel.textContent = "미리 보기";
}

function createForecastButton({ className, label, icon, detail, ariaLabel, pressed = false, onClick }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.setAttribute("aria-pressed", String(pressed));
  if (ariaLabel) button.setAttribute("aria-label", ariaLabel);
  button.innerHTML = `<span class="forecast-label">${label}</span><span class="weather-icon" aria-hidden="true">${icon}</span>${detail ? `<span class="forecast-detail">${detail}</span>` : ""}`;
  button.addEventListener("click", () => onClick(button));
  return button;
}

function selectForecastButton(selected) {
  document.querySelectorAll(".hour-button,.day-button").forEach((button) => {
    const active = button === selected;
    button.classList.toggle("is-selected", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function weatherIcon(condition, isDay) {
  if (condition === "clear" && !isDay) return "☾";
  return ICONS[condition] || ICONS.cloudy;
}

function conditionName(condition) {
  return { clear: "맑음", cloudy: "흐림", rain: "비", snow: "눈" }[condition] || "흐림";
}

function parseForecastDate(value) {
  return new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T12:00:00+09:00`);
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", weekday: "short" }).format(parseForecastDate(value));
}

function formatFullDate(value) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short" }).format(parseForecastDate(value));
}

function nearestRegion(latitude, longitude) {
  let nearest = REGIONS[0];
  let nearestDistance = Infinity;
  for (const region of REGIONS) {
    const latitudeDistance = (latitude - region[1]) * 111;
    const longitudeDistance = (longitude - region[2]) * 88;
    const distance = latitudeDistance ** 2 + longitudeDistance ** 2;
    if (distance < nearestDistance) {
      nearest = region;
      nearestDistance = distance;
    }
  }
  return `${nearest[0]} 인근`;
}

function showError(title, message) {
  ui.window.dataset.weather = "error";
  ui.card.setAttribute("aria-busy", "false");
  ui.location.textContent = "날씨를 불러오지 못했어요";
  ui.title.textContent = title;
  ui.description.textContent = message;
  ui.temperature.innerHTML = "--<span>°</span>";
  ui.fallbackMessage.textContent = message;
  ui.fallback.hidden = false;
  ui.forecastPanel.hidden = true;
}

function locateUser() {
  setLoading();
  if (!navigator.geolocation) {
    showError("위치를 확인할 수 없어요", "도시를 선택해 날씨를 확인해 주세요.");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => fetchWeather({ name: nearestRegion(coords.latitude, coords.longitude), latitude: coords.latitude, longitude: coords.longitude })
      .catch((error) => showError("하늘과 연결되지 않았어요", error.message)),
    (error) => showError(
      error.code === error.PERMISSION_DENIED ? "위치 권한이 꺼져 있어요" : "현재 위치를 찾지 못했어요",
      "도시를 선택하거나 위치 확인을 다시 시도해 주세요.",
    ),
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
  );
}

ui.cityForm.addEventListener("submit", (event) => {
  event.preventDefault();
  fetchWeather(CITIES[ui.citySelect.value]).catch((error) => showError("날씨를 불러오지 못했어요", error.message));
});
ui.retryLocation.addEventListener("click", locateUser);
ui.playForecast.addEventListener("click", playHourlyForecast);
locateUser();
