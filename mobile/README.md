# Daylight Weather

Expo / React Native phone app for current conditions, a five-day forecast, and cycling weather along a planned route.

## Run on a phone

1. Install **Expo Go** on your Android or iOS phone.
2. From this folder, install packages and start Expo:

   ```sh
   npm install
   npx expo start
   ```

3. Keep the computer and phone on the same Wi-Fi network and scan the QR code with Expo Go. If the network blocks local connections, try `npx expo start --tunnel`.

The app uses React Native Maps, which is supported in Expo Go for this SDK. Publishing a standalone Android app requires a Google Maps API key; Expo Go does not need one.

## Data sources

- Open-Meteo provides city search and weather forecasts.
- OpenStreetMap tiles and the public OSM bike router provide the map and cycling route.

An internet connection is required. Route weather is an hourly forecast estimate sampled at seven points, not live radar. The standalone web version remains at `../index.html`.
