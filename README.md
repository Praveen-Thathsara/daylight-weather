# Daylight Weather

A lightweight weather app with a cycling route planner. This repository keeps the standalone web version and an Expo / React Native app for Android and iOS.

## Phone app

The Expo app is in [`mobile/`](mobile/). Install [Expo Go](https://expo.dev/go) on your phone, then run:

```sh
cd mobile
npm install
npx expo start
```

Scan the QR code with Expo Go. Keep the phone and computer on the same Wi-Fi, or start with `npx expo start --tunnel` if local network connections are blocked. See [`mobile/README.md`](mobile/README.md) for details.

## Web version

Open [`index.html`](index.html) directly in a modern browser.

## Features

- Current conditions and a five-day forecast, with Matara, Sri Lanka as the initial city.
- City search.
- Cycling routes with forecast weather sampled at seven points along the route.
- Departure-time selection for forecasts within five days.
- Light and dark appearance.

The app uses Open-Meteo for weather and geocoding, plus OpenStreetMap tiles and a public cycling router. An internet connection is required. Route weather is a model forecast, not live radar, and should not be treated as a guarantee of road conditions. Attribution is shown in the app.
