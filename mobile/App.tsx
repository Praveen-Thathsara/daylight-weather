import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import MapView, { Marker, Polyline, UrlTile, type MapPressEvent, type Region } from 'react-native-maps';

type Place = {
  name: string;
  country?: string;
  admin1?: string;
  latitude: number;
  longitude: number;
};

type CurrentWeather = {
  temperature_2m: number;
  apparent_temperature: number;
  relative_humidity_2m: number;
  wind_speed_10m: number;
  weather_code: number;
};

type DailyWeather = {
  time: string[];
  weather_code: number[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
};

type WeatherResponse = {
  current: CurrentWeather;
  daily: DailyWeather;
  timezone?: string;
};

type RouteWeatherPoint = {
  latitude: number;
  longitude: number;
  name: string;
  rain: number;
  code: number;
  temperature?: number;
};

type CyclingRoute = {
  coordinates: [number, number][];
  distance: number;
  duration: number;
};

type HourlyResponse = {
  timezone?: string;
  hourly?: {
    time?: string[];
    weather_code?: number[];
    precipitation_probability?: number[];
    temperature_2m?: number[];
  };
};

const INITIAL_PLACE: Place = {
  name: 'Matara',
  country: 'Sri Lanka',
  admin1: 'Southern Province',
  latitude: 5.9549,
  longitude: 80.555,
};

const FALLBACK_WEATHER: WeatherResponse = {
  current: {
    temperature_2m: 29,
    apparent_temperature: 33,
    relative_humidity_2m: 76,
    wind_speed_10m: 14,
    weather_code: 2,
  },
  daily: {
    time: [],
    weather_code: [2, 1, 3, 61, 2],
    temperature_2m_max: [30, 30, 29, 28, 30],
    temperature_2m_min: [25, 25, 24, 24, 25],
  },
  timezone: 'Asia/Colombo',
};

const INITIAL_REGION: Region = {
  latitude: INITIAL_PLACE.latitude,
  longitude: INITIAL_PLACE.longitude,
  latitudeDelta: 1.15,
  longitudeDelta: 1.15,
};

const WEATHER_CODES: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mostly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Foggy',
  48: 'Foggy',
  51: 'Drizzle',
  53: 'Drizzle',
  55: 'Drizzle',
  56: 'Freezing drizzle',
  57: 'Freezing drizzle',
  61: 'Rain',
  63: 'Rain',
  65: 'Heavy rain',
  66: 'Freezing rain',
  67: 'Freezing rain',
  71: 'Snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Rain showers',
  81: 'Rain showers',
  82: 'Heavy showers',
  85: 'Snow showers',
  86: 'Snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm',
  99: 'Thunderstorm',
};

const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);

function conditionFor(code: number): string {
  return WEATHER_CODES[code] ?? 'Variable conditions';
}

function weatherEmoji(code: number): string {
  if (code === 0) return '☀️';
  if (code === 1 || code === 2) return '🌤️';
  if (code === 3) return '☁️';
  if (code === 45 || code === 48) return '🌫️';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '❄️';
  if ([95, 96, 99].includes(code)) return '⛈️';
  if (RAIN_CODES.has(code)) return '🌧️';
  return '☁️';
}

function rainColor(point?: RouteWeatherPoint): string {
  if (!point) return '#3f86b4';
  if (point.rain >= 60 || (RAIN_CODES.has(point.code) && point.rain >= 35)) return '#438fc2';
  if (point.rain >= 30 || RAIN_CODES.has(point.code)) return '#edaa45';
  return '#42a879';
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed (${response.status}).`);
  return response.json() as Promise<T>;
}

async function searchCity(query: string): Promise<Place> {
  const params = new URLSearchParams({ name: query, count: '10', language: 'en', format: 'json' });
  const result = await fetchJson<{ results?: Place[] }>(
    `https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`,
  );
  if (!result.results?.length) throw new Error('No matching city found. Try another spelling.');
  const normalized = query.trim().toLocaleLowerCase();
  return result.results.find((place) => place.name.toLocaleLowerCase() === normalized) ?? result.results[0];
}

async function fetchWeather(latitude: number, longitude: number): Promise<WeatherResponse> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    forecast_days: '5',
    timezone: 'auto',
  });
  return fetchJson<WeatherResponse>(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
}

function fallbackWithDates(): WeatherResponse {
  const time = Array.from({ length: 5 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    return date.toISOString().slice(0, 10);
  });
  return { ...FALLBACK_WEATHER, daily: { ...FALLBACK_WEATHER.daily, time } };
}

function haversineKm(a: [number, number], b: [number, number]): number {
  const radians = Math.PI / 180;
  const dLat = (b[1] - a[1]) * radians;
  const dLon = (b[0] - a[0]) * radians;
  const lat1 = a[1] * radians;
  const lat2 = b[1] * radians;
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function routeDistances(coordinates: [number, number][]): number[] {
  const distances = [0];
  for (let index = 1; index < coordinates.length; index += 1) {
    distances.push(distances[index - 1] + haversineKm(coordinates[index - 1], coordinates[index]));
  }
  return distances;
}

function coordinateAtDistance(
  coordinates: [number, number][],
  distances: number[],
  target: number,
): [number, number] {
  let segment = distances.findIndex((distance) => distance >= target);
  if (segment < 1) segment = 1;
  const segmentLength = distances[segment] - distances[segment - 1] || 1;
  const fraction = Math.max(0, Math.min(1, (target - distances[segment - 1]) / segmentLength));
  const start = coordinates[segment - 1];
  const end = coordinates[segment];
  return [start[0] + (end[0] - start[0]) * fraction, start[1] + (end[1] - start[1]) * fraction];
}

function sampleRoute(route: CyclingRoute): RouteWeatherPoint[] {
  const distances = routeDistances(route.coordinates);
  const total = distances[distances.length - 1] || 1;
  return Array.from({ length: 7 }, (_, index) => {
    const [longitude, latitude] = coordinateAtDistance(
      route.coordinates,
      distances,
      (total * index) / 6,
    );
    return {
      latitude,
      longitude,
      name: index === 0 ? 'Start' : index === 6 ? 'Destination' : `Route point ${index}`,
      rain: 0,
      code: -1,
    };
  });
}

function timezoneHour(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}`;
}

async function fetchRouteWeather(
  points: RouteWeatherPoint[],
  departure: Date,
): Promise<RouteWeatherPoint[]> {
  const params = new URLSearchParams({
    latitude: points.map((point) => point.latitude.toFixed(4)).join(','),
    longitude: points.map((point) => point.longitude.toFixed(4)).join(','),
    hourly: 'weather_code,precipitation_probability,temperature_2m',
    forecast_days: '5',
    timezone: 'auto',
  });
  const payload = await fetchJson<HourlyResponse[] | HourlyResponse>(
    `https://api.open-meteo.com/v1/forecast?${params.toString()}`,
  );
  const locations = Array.isArray(payload) ? payload : [payload];
  return points.map((point, index) => {
    const hourly = locations[index]?.hourly;
    if (!hourly?.time?.length) throw new Error('Forecast is missing for part of this route.');
    const hour = timezoneHour(departure, locations[index].timezone ?? 'UTC');
    let hourIndex = hourly.time.findIndex((time) => time.slice(0, 13) === hour);
    if (hourIndex < 0) {
      hourIndex = hourly.time.findIndex((time) => time >= hour);
      if (hourIndex < 0) throw new Error('Choose a trip time within the available five-day forecast.');
    }
    return {
      ...point,
      rain: hourly.precipitation_probability?.[hourIndex] ?? 0,
      code: hourly.weather_code?.[hourIndex] ?? -1,
      temperature: hourly.temperature_2m?.[hourIndex],
    };
  });
}

function routeSegments(route: CyclingRoute, weather: RouteWeatherPoint[]) {
  const coordinates = route.coordinates;
  const distances = routeDistances(coordinates);
  const total = distances[distances.length - 1] || 1;
  return Array.from({ length: 6 }, (_, index) => {
    const startDistance = (total * index) / 6;
    const endDistance = (total * (index + 1)) / 6;
    const start = coordinateAtDistance(coordinates, distances, startDistance);
    const end = coordinateAtDistance(coordinates, distances, endDistance);
    const segmentCoordinates: { latitude: number; longitude: number }[] = [
      { latitude: start[1], longitude: start[0] },
    ];
    for (let pointIndex = 1; pointIndex < coordinates.length - 1; pointIndex += 1) {
      if (distances[pointIndex] > startDistance && distances[pointIndex] < endDistance) {
        segmentCoordinates.push({
          latitude: coordinates[pointIndex][1],
          longitude: coordinates[pointIndex][0],
        });
      }
    }
    segmentCoordinates.push({ latitude: end[1], longitude: end[0] });
    const sampleIndex = Math.min(weather.length - 1, Math.floor(((index + 0.5) / 6) * weather.length));
    return { coordinates: segmentCoordinates, color: rainColor(weather[sampleIndex]) };
  });
}

function tripDateLabel(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function dayName(date: string, index: number): string {
  if (index === 0) return 'Today';
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

export default function App() {
  const colorScheme = useColorScheme();
  const dark = colorScheme === 'dark';
  const colors = useMemo(
    () => dark
      ? { background: '#142333', card: '#1d2b3a', ink: '#e8eef5', muted: '#98a9bc', line: '#344454', accent: '#e6a054' }
      : { background: '#f1f6fa', card: '#ffffff', ink: '#17283b', muted: '#718198', line: '#e1e8ee', accent: '#e99a46' },
    [dark],
  );
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const mapRef = useRef<MapView>(null);
  const [place, setPlace] = useState<Place>(INITIAL_PLACE);
  const [weather, setWeather] = useState<WeatherResponse>(() => fallbackWithDates());
  const [weatherIsFallback, setWeatherIsFallback] = useState(true);
  const [weatherBusy, setWeatherBusy] = useState(true);
  const [weatherMessage, setWeatherMessage] = useState('');
  const [cityQuery, setCityQuery] = useState('');
  const [cityBusy, setCityBusy] = useState(false);
  const [routeStartText, setRouteStartText] = useState('');
  const [routeEndText, setRouteEndText] = useState('');
  const [routeStart, setRouteStart] = useState<Place | null>(null);
  const [routeEnd, setRouteEnd] = useState<Place | null>(null);
  const [route, setRoute] = useState<CyclingRoute | null>(null);
  const [routeWeather, setRouteWeather] = useState<RouteWeatherPoint[]>([]);
  const [routeBusy, setRouteBusy] = useState(false);
  const [routeMessage, setRouteMessage] = useState('');
  const [departure, setDeparture] = useState(() => {
    const date = new Date(Date.now() + 60 * 60 * 1000);
    date.setMinutes(0, 0, 0);
    return date;
  });
  const [maxDeparture] = useState(() => new Date(Date.now() + 5 * 24 * 60 * 60 * 1000));
  const [pickerMode, setPickerMode] = useState<'date' | 'time' | null>(null);
  const [mapClickCount, setMapClickCount] = useState(0);

  useEffect(() => {
    let active = true;
    fetchWeather(INITIAL_PLACE.latitude, INITIAL_PLACE.longitude)
      .then((data) => {
        if (!active) return;
        setWeather(data);
        setWeatherIsFallback(false);
        setWeatherMessage('');
      })
      .catch(() => {
        if (!active) return;
        setWeather(fallbackWithDates());
        setWeatherIsFallback(true);
        setWeatherMessage('Showing sample weather; live data is unavailable.');
      })
      .finally(() => {
        if (active) setWeatherBusy(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function loadPlace(nextPlace: Place) {
    setPlace(nextPlace);
    setWeatherBusy(true);
    setWeatherMessage('');
    mapRef.current?.animateToRegion({
      latitude: nextPlace.latitude,
      longitude: nextPlace.longitude,
      latitudeDelta: 1.15,
      longitudeDelta: 1.15,
    });
    try {
      const data = await fetchWeather(nextPlace.latitude, nextPlace.longitude);
      setWeather(data);
      setWeatherIsFallback(false);
    } catch {
      setWeather(fallbackWithDates());
      setWeatherIsFallback(true);
      setWeatherMessage('Showing sample weather; live data is unavailable.');
    } finally {
      setWeatherBusy(false);
    }
  }

  async function submitCitySearch() {
    const query = cityQuery.trim();
    if (!query) return;
    Keyboard.dismiss();
    setCityBusy(true);
    setWeatherMessage('');
    try {
      const result = await searchCity(query);
      await loadPlace(result);
      setCityQuery('');
    } catch (error) {
      setWeatherMessage(error instanceof Error ? error.message : 'Could not search for that city.');
    } finally {
      setCityBusy(false);
    }
  }

  function setRouteEndpoint(point: { latitude: number; longitude: number }) {
    const nextPoint: Place = {
      name: `${point.latitude.toFixed(4)}, ${point.longitude.toFixed(4)}`,
      latitude: point.latitude,
      longitude: point.longitude,
    };
    setRoute(null);
    setRouteWeather([]);
    setRouteMessage('');
    if (mapClickCount % 2 === 0) {
      setRouteStart(nextPoint);
      setRouteStartText(nextPoint.name);
      setRouteEnd(null);
      setRouteEndText('');
      setMapClickCount(1);
    } else {
      setRouteEnd(nextPoint);
      setRouteEndText(nextPoint.name);
      setMapClickCount(2);
    }
  }

  async function resolveRoutePlace(text: string, savedPlace: Place | null): Promise<Place> {
    if (!text.trim()) throw new Error('Enter both a start and a destination.');
    if (savedPlace?.name === text.trim()) return savedPlace;
    const match = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (match) {
      const latitude = Number(match[1]);
      const longitude = Number(match[2]);
      if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        throw new Error('Coordinates must be latitude, longitude.');
      }
      return { name: text.trim(), latitude, longitude };
    }
    return searchCity(text.trim());
  }

  async function planRoute() {
    Keyboard.dismiss();
    setRouteBusy(true);
    setRouteMessage('Finding a cycling route…');
    setRoute(null);
    setRouteWeather([]);
    try {
      if (departure.getTime() < Date.now() - 60 * 60 * 1000 || departure.getTime() > Date.now() + 5 * 24 * 60 * 60 * 1000) {
        throw new Error('Choose a departure time within the next five days.');
      }
      const start = await resolveRoutePlace(routeStartText, routeStart);
      const end = await resolveRoutePlace(routeEndText, routeEnd);
      setRouteStart(start);
      setRouteEnd(end);
      setRouteStartText(start.name);
      setRouteEndText(end.name);
      const coordinates = `${start.longitude},${start.latitude};${end.longitude},${end.latitude}`;
      const params = new URLSearchParams({ overview: 'full', geometries: 'geojson', steps: 'false' });
      const result = await fetchJson<{
        routes?: { geometry?: { coordinates?: [number, number][] }; distance: number; duration: number }[];
      }>(`https://routing.openstreetmap.de/routed-bike/route/v1/driving/${coordinates}?${params.toString()}`);
      const source = result.routes?.[0];
      if (!source?.geometry?.coordinates?.length) throw new Error('No bike route found. Try different places.');
      const bikeRoute: CyclingRoute = {
        coordinates: source.geometry.coordinates,
        distance: source.distance,
        duration: source.duration,
      };
      setRoute(bikeRoute);
      const samples = sampleRoute(bikeRoute);
      try {
        const forecast = await fetchRouteWeather(samples, departure);
        setRouteWeather(forecast);
        setRouteMessage('Forecast sampled at seven route points. Rain probability is an estimate, not live radar.');
      } catch (error) {
        setRouteWeather([]);
        setRouteMessage(
          `${error instanceof Error ? error.message : 'Route forecast unavailable.'} The cycling route is shown without weather colors.`,
        );
      }
      const fitPoints = bikeRoute.coordinates
        .filter((_, index) => index % Math.max(1, Math.floor(bikeRoute.coordinates.length / 28)) === 0)
        .map(([longitude, latitude]) => ({ latitude, longitude }));
      mapRef.current?.fitToCoordinates(fitPoints, {
        edgePadding: { top: 60, right: 50, bottom: 60, left: 50 },
        animated: true,
      });
    } catch (error) {
      setRouteMessage(error instanceof Error ? error.message : 'Unable to plan this route.');
    } finally {
      setRouteBusy(false);
    }
  }

  function handleMapPress(event: MapPressEvent) {
    if (!routeBusy) setRouteEndpoint(event.nativeEvent.coordinate);
  }

  function handlePickerChange(event: DateTimePickerEvent, value?: Date) {
    if (Platform.OS === 'android') setPickerMode(null);
    if (event.type === 'set' && value) {
      setDeparture((current) => {
        const next = new Date(current);
        if (pickerMode === 'date') {
          next.setFullYear(value.getFullYear(), value.getMonth(), value.getDate());
        } else {
          next.setHours(value.getHours(), value.getMinutes(), 0, 0);
        }
        return next;
      });
    }
  }

  const routePointWeather = routeWeather.length ? routeWeather : route ? sampleRoute(route) : [];
  const wettestPoint = routeWeather.reduce<RouteWeatherPoint | null>(
    (wettest, point) => (!wettest || point.rain > wettest.rain ? point : wettest),
    null,
  );
  const routeDisplay = route
    ? route.distance >= 1000
      ? `${(route.distance / 1000).toFixed(1)} km`
      : `${Math.round(route.distance)} m`
    : '';
  const riskTitle = wettestPoint
    ? wettestPoint.rain >= 60
      ? `Rain likely near ${wettestPoint.name}`
      : wettestPoint.rain >= 30
        ? `Showers possible near ${wettestPoint.name}`
        : 'Mostly clear along this route'
    : '';
  const routeLineSegments = route && routeWeather.length ? routeSegments(route, routeWeather) : [];
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topline}>
          <View style={styles.brand}>
            <Text style={styles.brandIcon}>☀</Text>
            <Text style={styles.brandText}>Daylight</Text>
          </View>
          <Text style={styles.liveLabel}>
            <Text style={[styles.liveDot, weatherIsFallback ? styles.sampleDot : null]}>● </Text>
            {weatherBusy ? 'Updating' : weatherIsFallback ? 'Sample weather' : 'Live forecast'}
          </Text>
        </View>

        <View style={styles.searchRow}>
          <TextInput
            value={cityQuery}
            onChangeText={setCityQuery}
            onSubmitEditing={submitCitySearch}
            placeholder="Search for a city…"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Search for a city"
            returnKeyType="search"
            style={styles.searchInput}
          />
          <Pressable
            onPress={submitCitySearch}
            disabled={cityBusy}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          >
            {cityBusy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.primaryButtonText}>Search</Text>}
          </Pressable>
        </View>

        <View style={styles.currentCard}>
          <Text style={styles.eyebrow}>TODAY</Text>
          <Text style={styles.cityName}>{place.name}</Text>
          <Text style={styles.country}>{[place.admin1, place.country].filter(Boolean).join(', ')}</Text>
          <View style={styles.currentWeather}>
            <View>
              <Text style={styles.temperature}>
                {Math.round(weather.current.temperature_2m)}
                <Text style={styles.degree}>°</Text>
              </Text>
              <Text style={styles.condition}>{conditionFor(weather.current.weather_code)}</Text>
            </View>
            <Text style={styles.weatherEmoji}>{weatherEmoji(weather.current.weather_code)}</Text>
          </View>
          <View style={styles.metrics}>
            <Metric label="Humidity" value={`${weather.current.relative_humidity_2m}%`} styles={styles} />
            <Metric label="Wind" value={`${Math.round(weather.current.wind_speed_10m)} km/h`} styles={styles} />
            <Metric label="Feels like" value={`${Math.round(weather.current.apparent_temperature)}°`} styles={styles} />
          </View>
        </View>
        {weatherMessage ? <Text style={styles.infoMessage}>{weatherMessage}</Text> : null}

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>5-day forecast</Text>
          <Text style={styles.sectionCaption}>High / low</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.forecastRow}>
          {weather.daily.time.slice(0, 5).map((date, index) => (
            <View key={date} style={styles.forecastCard}>
              <Text style={styles.dayName}>{dayName(date, index)}</Text>
              <Text style={styles.forecastEmoji}>{weatherEmoji(weather.daily.weather_code[index])}</Text>
              <Text style={styles.dayCondition}>{conditionFor(weather.daily.weather_code[index])}</Text>
              <Text style={styles.dayTemps}>
                {Math.round(weather.daily.temperature_2m_max[index])}°{' '}
                <Text style={styles.dayLow}>{Math.round(weather.daily.temperature_2m_min[index])}°</Text>
              </Text>
            </View>
          ))}
        </ScrollView>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Plan a ride</Text>
          <Text style={styles.sectionCaption}>Weather along your route</Text>
        </View>
        <Text style={styles.intro}>
          Enter your start and destination, or tap two map points. Check rain conditions along the cycling route.
        </Text>
        <View style={styles.routeInputs}>
          <TextInput
            value={routeStartText}
            onChangeText={setRouteStartText}
            placeholder="Start (e.g. Matara)"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Route start"
            returnKeyType="next"
            style={styles.routeInput}
          />
          <TextInput
            value={routeEndText}
            onChangeText={setRouteEndText}
            placeholder="Destination (e.g. Galle)"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Route destination"
            returnKeyType="done"
            onSubmitEditing={planRoute}
            style={styles.routeInput}
          />
        </View>
        <View style={styles.departureRow}>
          <Text style={styles.departureLabel}>Departure</Text>
          <View style={styles.timeButtons}>
            <Pressable onPress={() => setPickerMode('date')} style={styles.timeButton}>
              <Text style={styles.timeButtonText}>{new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(departure)}</Text>
            </Pressable>
            <Pressable onPress={() => setPickerMode('time')} style={styles.timeButton}>
              <Text style={styles.timeButtonText}>{new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(departure)}</Text>
            </Pressable>
          </View>
        </View>
        {pickerMode ? (
          <DateTimePicker
            value={departure}
            mode={pickerMode}
            display={Platform.OS === 'ios' ? 'compact' : 'default'}
            minimumDate={pickerMode === 'date' ? new Date() : undefined}
            maximumDate={pickerMode === 'date' ? maxDeparture : undefined}
            onChange={handlePickerChange}
          />
        ) : null}
        <Pressable
          onPress={planRoute}
          disabled={routeBusy}
          style={({ pressed }) => [styles.routeButton, pressed && styles.pressed]}
        >
          {routeBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Check bike route</Text>}
        </Pressable>

        <View style={styles.mapCard}>
          <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={INITIAL_REGION}
            onPress={handleMapPress}
            showsCompass
            showsScale
            toolbarEnabled={false}
            mapType="standard"
          >
            <UrlTile
              urlTemplate="https://tile.openstreetmap.de/{z}/{x}/{y}.png"
              maximumZ={19}
              tileSize={256}
              zIndex={1}
            />
            {route && routeWeather.length
              ? routeLineSegments.map((segment, index) => (
                  <Polyline
                    key={`route-segment-${index}`}
                    coordinates={segment.coordinates}
                    strokeColor={segment.color}
                    strokeWidth={6}
                    lineCap="round"
                    lineJoin="round"
                    zIndex={3}
                  />
                ))
              : route
                ? <Polyline coordinates={route.coordinates.map(([longitude, latitude]) => ({ latitude, longitude }))} strokeColor="#3f86b4" strokeWidth={6} zIndex={3} />
                : null}
            {routeStart ? (
              <Marker
                coordinate={{ latitude: routeStart.latitude, longitude: routeStart.longitude }}
                title="Start"
                description={routeStart.name}
                pinColor="#315c82"
              />
            ) : null}
            {routeEnd ? (
              <Marker
                coordinate={{ latitude: routeEnd.latitude, longitude: routeEnd.longitude }}
                title="Destination"
                description={routeEnd.name}
                pinColor="#d96c58"
              />
            ) : null}
            {routeWeather.map((point, index) => (
              <Marker
                key={`weather-${index}`}
                coordinate={{ latitude: point.latitude, longitude: point.longitude }}
                title={point.name}
                description={`${conditionFor(point.code)} · ${point.rain}% rain chance`}
                pinColor={rainColor(point)}
              />
            ))}
          </MapView>
          <Text style={styles.mapHint}>
            {route ? 'Drag to pan · pinch to zoom · tap the map to start a new route' : 'Tap the map to choose start, then destination'}
          </Text>
        </View>
        <Text style={styles.attribution}>Map data © OpenStreetMap contributors</Text>
        <View style={styles.legend}>
          <LegendItem color="#42a879" label="Low rain chance" styles={styles} />
          <LegendItem color="#edaa45" label="Showers possible" styles={styles} />
          <LegendItem color="#438fc2" label="Rain likely" styles={styles} />
        </View>

        {route ? (
          <View style={styles.routeSummary}>
            {riskTitle ? <Text style={styles.routeTitle}>{riskTitle}</Text> : null}
            <Text style={styles.routeMeta}>
              {routeDisplay} bike route · about {Math.max(1, Math.round(route.duration / 60))} min · {tripDateLabel(departure)}
              {routeWeather.length ? ' · forecast estimate, not radar' : ' · weather unavailable'}
            </Text>
            {routePointWeather.length ? (
              <View style={styles.stops}>
                {routePointWeather.map((point, index) => (
                  <View key={`stop-${index}`} style={styles.stopCard}>
                    <Text style={styles.stopName}>{point.name}</Text>
                    <Text style={styles.stopCondition}>
                      {routeWeather.length
                        ? `${conditionFor(point.code)}${Number.isFinite(point.temperature) ? ` · ${Math.round(point.temperature!)}°` : ''}`
                        : 'Forecast unavailable'}
                    </Text>
                    <Text style={[styles.stopRain, { color: routeWeather.length ? rainColor(point) : colors.muted }]}>
                      {routeWeather.length ? `${point.rain}% rain chance` : 'No live data'}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
        {routeMessage ? <Text style={styles.routeMessage}>{routeMessage}</Text> : null}
        <Text style={styles.disclaimer}>
          Forecasts are model estimates, not live radar. Conditions can change during a ride.
        </Text>
        <Text style={styles.footer}>Weather by Open-Meteo · Map © OpenStreetMap contributors</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function LegendItem({
  color,
  label,
  styles,
}: {
  color: string;
  label: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function makeStyles(colors: {
  background: string;
  card: string;
  ink: string;
  muted: string;
  line: string;
  accent: string;
}) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    scroll: { flex: 1 },
    content: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 36 },
    topline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
    brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
    brandIcon: {
      width: 34,
      height: 34,
      overflow: 'hidden',
      borderRadius: 12,
      textAlign: 'center',
      textAlignVertical: 'center',
      color: '#fff',
      backgroundColor: colors.accent,
      fontSize: 21,
    },
    brandText: { color: colors.ink, fontSize: 15, fontWeight: '700' },
    liveLabel: { color: colors.muted, fontSize: 12 },
    liveDot: { color: '#54b784' },
    sampleDot: { color: '#e1a34b' },
    searchRow: {
      minHeight: 50,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 16,
      padding: 5,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 15,
      backgroundColor: colors.card,
    },
    searchInput: { flex: 1, minWidth: 0, paddingHorizontal: 10, color: colors.ink, fontSize: 14 },
    primaryButton: {
      minHeight: 40,
      minWidth: 77,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 15,
      borderRadius: 11,
      backgroundColor: '#203d59',
    },
    primaryButtonText: { color: '#fff', fontSize: 13, fontWeight: '700' },
    pressed: { opacity: 0.78 },
    currentCard: {
      marginBottom: 20,
      padding: 22,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 23,
      backgroundColor: colors.card,
      shadowColor: '#30465a',
      shadowOpacity: 0.08,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 3,
    },
    eyebrow: { color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
    cityName: { marginTop: 5, color: colors.ink, fontSize: 27, fontWeight: '700', letterSpacing: -0.5 },
    country: { marginTop: 3, color: colors.muted, fontSize: 14 },
    currentWeather: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 19 },
    temperature: { color: colors.ink, fontSize: 83, fontWeight: '300', letterSpacing: -5, lineHeight: 91 },
    degree: { fontSize: 34, fontWeight: '400' },
    condition: { marginLeft: 4, color: colors.muted, fontSize: 14, fontWeight: '600' },
    weatherEmoji: { marginRight: 8, fontSize: 67 },
    metrics: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 8,
      marginTop: 23,
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: colors.line,
    },
    metric: { minWidth: 0, flex: 1 },
    metricLabel: { color: colors.muted, fontSize: 11 },
    metricValue: { marginTop: 4, color: colors.ink, fontSize: 13, fontWeight: '700' },
    infoMessage: { marginTop: -12, marginBottom: 18, color: colors.muted, fontSize: 12 },
    sectionHeading: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 8,
      marginBottom: 10,
    },
    sectionTitle: { color: colors.ink, fontSize: 16, fontWeight: '700' },
    sectionCaption: { flexShrink: 1, color: colors.muted, fontSize: 11 },
    forecastRow: { gap: 8, paddingBottom: 4 },
    forecastCard: {
      width: 100,
      minHeight: 142,
      alignItems: 'center',
      padding: 12,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 15,
      backgroundColor: colors.card,
    },
    dayName: { color: colors.ink, fontSize: 12, fontWeight: '700' },
    forecastEmoji: { marginVertical: 8, fontSize: 30 },
    dayCondition: { color: colors.muted, fontSize: 10, textAlign: 'center' },
    dayTemps: { marginTop: 9, color: colors.ink, fontSize: 12, fontWeight: '700' },
    dayLow: { color: colors.muted, fontWeight: '500' },
    intro: { marginTop: -3, marginBottom: 12, color: colors.muted, fontSize: 13, lineHeight: 19 },
    routeInputs: { gap: 8 },
    routeInput: {
      minHeight: 46,
      paddingHorizontal: 13,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 12,
      color: colors.ink,
      backgroundColor: colors.card,
      fontSize: 13,
    },
    departureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
    departureLabel: { color: colors.muted, fontSize: 12 },
    timeButtons: { flexDirection: 'row', gap: 7 },
    timeButton: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.card },
    timeButtonText: { color: colors.ink, fontSize: 12, fontWeight: '600' },
    routeButton: {
      minHeight: 46,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 11,
      marginBottom: 12,
      borderRadius: 12,
      backgroundColor: '#203d59',
    },
    mapCard: {
      overflow: 'hidden',
      height: 360,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 18,
      backgroundColor: colors.card,
    },
    map: { flex: 1 },
    mapHint: {
      position: 'absolute',
      right: 10,
      bottom: 10,
      left: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
      overflow: 'hidden',
      borderRadius: 9,
      color: '#203d59',
      backgroundColor: 'rgba(255,255,255,0.93)',
      fontSize: 11,
    },
    attribution: { marginTop: 5, color: colors.muted, fontSize: 10, textAlign: 'right' },
    legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 11, marginTop: 10 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendText: { color: colors.muted, fontSize: 10 },
    routeSummary: {
      marginTop: 12,
      padding: 13,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 14,
      backgroundColor: colors.card,
    },
    routeTitle: { color: colors.ink, fontSize: 14, fontWeight: '700' },
    routeMeta: { marginTop: 5, marginBottom: 10, color: colors.muted, fontSize: 11, lineHeight: 16 },
    stops: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    stopCard: { width: '31%', minHeight: 68, padding: 8, borderRadius: 10, backgroundColor: colors.background },
    stopName: { color: colors.ink, fontSize: 10, fontWeight: '700' },
    stopCondition: { marginTop: 4, color: colors.muted, fontSize: 9 },
    stopRain: { marginTop: 3, fontSize: 10, fontWeight: '700' },
    routeMessage: { marginTop: 9, color: colors.muted, fontSize: 11, lineHeight: 16 },
    disclaimer: { marginTop: 18, color: colors.muted, fontSize: 11, lineHeight: 16, textAlign: 'center' },
    footer: { marginTop: 10, color: colors.muted, fontSize: 10, textAlign: 'center' },
  });
}
