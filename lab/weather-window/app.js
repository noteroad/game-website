const ui = {
  window: document.querySelector("#window"), card: document.querySelector("#weather-card"),
  location: document.querySelector("#location"), title: document.querySelector("#weather-title"),
  description: document.querySelector("#description"), temperature: document.querySelector("#temperature"),
  fallback: document.querySelector("#fallback-panel"), fallbackMessage: document.querySelector("#fallback-message"),
  cityForm: document.querySelector("#city-form"), citySelect: document.querySelector("#city-select"),
  retryLocation: document.querySelector("#retry-location"),
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

function setLoading(text = "현재 위치를 찾는 중") {
  ui.card.setAttribute("aria-busy", "true");
  ui.window.dataset.weather = "loading";
  ui.location.textContent = text;
  ui.title.textContent = "잠시, 창밖을 불러올게요";
  ui.description.textContent = "기상청에서 지금의 하늘을 확인하고 있어요.";
  ui.temperature.innerHTML = "--<span>°</span>";
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
  const weather = COPY[data.condition] ? data.condition : "cloudy";
  const time = data.isDay ? "day" : "night";
  const [title, description] = COPY[weather][time];
  ui.window.dataset.weather = weather;
  ui.window.dataset.time = time;
  ui.location.textContent = `${placeName} · ${time === "day" ? "낮" : "밤"}`;
  ui.title.textContent = title;
  ui.description.textContent = description;
  ui.temperature.innerHTML = `${Math.round(temperature)}<span>°</span>`;
  ui.temperature.setAttribute("aria-label", `현재 기온 섭씨 ${Math.round(temperature)}도`);
  ui.card.setAttribute("aria-busy", "false");
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
