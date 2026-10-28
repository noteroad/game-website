import { onRequestGet as getWeather } from "./functions/api/weather.js";

export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);

    if (url.pathname === "/api/weather") {
      if (request.method !== "GET") {
        return new Response("Method Not Allowed", {
          status: 405,
          headers: { Allow: "GET" },
        });
      }

      return getWeather({
        request,
        env,
        waitUntil: context.waitUntil.bind(context),
      });
    }

    return env.ASSETS.fetch(request);
  },
};
