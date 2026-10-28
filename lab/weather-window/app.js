const ui = {
  window: document.querySelector("#window"), card: document.querySelector("#weather-card"),
  location: document.querySelector("#location"), title: document.querySelector("#weather-title"),
  description: document.querySelector("#description"), temperature: document.querySelector("#temperature"),
  fallback: document.querySelector("#fallback-panel"), fallbackMessage: document.querySelector("#fallback-message"),
  cityForm: document.querySelector("#city-form"), citySelect: document.querySelector("#city-select"),
  retryLocation: document.querySelector("#retry-location"),
  forecastPanel: document.querySelector("#forecast-panel"),
  hourlyList: document.querySelector("#hourly-list"), weeklyList: document.querySelector("#weekly-list"),
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
let currentPlaceName = "현재 위치";
let weatherData = null;

function setLoading(text = "현재 위치를 찾는 중") {
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

  const current = createForecastButton({
    className: "hour-button is-selected",
    label: "지금",
    icon: weatherIcon(weatherData.condition, weatherData.isDay),
    detail: `${Math.round(weatherData.temperature)}°`,
    pressed: true,
    onClick: (button) => {
      selectForecastButton(button);
      renderScene({
        label: `${currentPlaceName} · 지금`,
        condition: weatherData.condition,
        isDay: weatherData.isDay,
        temperature: weatherData.temperature,
      });
    },
  });
  ui.hourlyList.append(current);

  for (const hour of weatherData.hourlyForecast || []) {
    const hourText = `${hour.time.slice(0, 2)}시`;
    ui.hourlyList.append(createForecastButton({
      className: "hour-button",
      label: hourText,
      icon: weatherIcon(hour.condition, hour.isDay),
      detail: `${Math.round(hour.temperature)}°`,
      onClick: (button) => {
        selectForecastButton(button);
        renderScene({
          label: `${currentPlaceName} · ${formatFullDate(hour.date)} ${hourText}`,
          condition: hour.condition,
          isDay: hour.isDay,
          temperature: hour.temperature,
          description: `${hourText}에 예상되는 창밖 풍경이에요.`,
        });
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
}

function createForecastButton({ className, label, icon, detail, ariaLabel, pressed = false, onClick }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.setAttribute("role", "listitem");
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
    ({ coords }) => fetchWeather({ name: "현재 위치", latitude: coords.latitude, longitude: coords.longitude })
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
locateUser();
