import { useEffect, useMemo, useRef, useState } from 'react';
import type { ECharts } from 'echarts/core';
import { ArrowCounterClockwiseIcon, GlobeHemisphereWestIcon, MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon } from '@phosphor-icons/react';
import { Button, Chart, ChartPalette, LayerCard, Loader, Switch } from '@cloudflare/kumo';
import { assetUrl } from '@/lib/basePath';
import { echarts, KUMO_TOOLTIP_STYLE, REPLACE_SERIES } from '@/lib/echarts';
import { useI18n } from '@/lib/i18n';
import { useIsDarkMode } from '@/lib/theme';
import { getCountryName } from '@/lib/utils';
import type { DashboardAttackLocationDatum, WorldMapDatum } from '@/types';

const MAP_NAME = 'crowdsec-world';
const MARKERS_STORAGE_KEY = 'crowdsec-web-ui:dashboard:map-animation-enabled';
const PULSING_MARKERS = 10;
const ZOOM_STEP = 1.5;
// The window Kumo's own maps show: the empty Arctic and most of Antarctica cropped
const BOUNDING_COORDS = [[-180, 80], [180, -58]];
// Mercator stretches the poles to infinity, so latitudes are clamped like web maps do
const MAX_LATITUDE = 85.0511;

const mercatorY = (latitude: number) => (Math.log(Math.tan(Math.PI / 4 + (Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, latitude)) * Math.PI) / 360)) * 180) / Math.PI;
const PROJECTION = {
  project: ([longitude, latitude]: number[]) => [longitude, -mercatorY(latitude)],
  unproject: ([x, y]: number[]) => [x, (Math.atan(Math.exp((-y * Math.PI) / 180)) * 360) / Math.PI - 90],
};
// ECharts keeps a hovered country in its own shade instead of its highlight color only when both colors are null, which its types do not allow
const KEEP_FILL = { areaColor: null, color: null } as unknown as Record<string, string>;
const ASPECT_RATIO = 360 / (mercatorY(80) - mercatorY(-58));

let worldPromise: Promise<void> | null = null;

function loadWorld(): Promise<void> {
  worldPromise ??= fetch(assetUrl('/world-50m.json'))
    .then((response) => {
      if (!response.ok) throw new Error(`Failed to load map data: ${response.status}`);
      return response.json();
    })
    .then((geoJson) => echarts.registerMap(MAP_NAME, geoJson))
    .catch((error: unknown) => {
      worldPromise = null;
      throw error;
    });
  return worldPromise;
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

type MapDatum = { kind: 'country'; country: WorldMapDatum } | { kind: 'location'; location: DashboardAttackLocationDatum };

/** Countries shaded by their alerts like Cloudflare's traffic maps, with the approximate attack locations as markers, where a click filters by the country */
export function WorldMapCard({
  data,
  attackLocations,
  onCountrySelect,
  selectedCountry,
  simulationsEnabled,
  selectionDisabledReason,
}: {
  data: WorldMapDatum[];
  attackLocations: DashboardAttackLocationDatum[];
  onCountrySelect: (countryCode: string) => void;
  selectedCountry: string | null;
  simulationsEnabled: boolean;
  selectionDisabledReason?: string;
}) {
  const { language, t } = useI18n();
  const isDarkMode = useIsDarkMode();
  const chartRef = useRef<ECharts | null>(null);
  const [mapState, setMapState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [viewKey, setViewKey] = useState(0);
  const [markersEnabled, setMarkersEnabled] = useState(() => {
    const stored = window.localStorage.getItem(MARKERS_STORAGE_KEY);
    return stored === null ? !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches : stored !== 'false';
  });

  useEffect(() => {
    loadWorld().then(() => setMapState('ready'), () => setMapState('error'));
  }, []);

  const options = useMemo(() => {
    const palette = ChartPalette.mapColors(isDarkMode);
    const markerColor = ChartPalette.semantic('Attention', isDarkMode);
    const textColor = ChartPalette.text('primary', isDarkMode);
    const maxCount = Math.max(1, ...data.map((country) => country.count));
    const locations = markersEnabled ? [...attackLocations].sort((a, b) => b.count - a.count) : [];
    const maxLocationCount = Math.max(1, ...locations.map((location) => location.count));
    const toMarker = (location: DashboardAttackLocationDatum) => ({
      value: [location.longitude, location.latitude, location.count],
      symbolSize: 4 + Math.sqrt(location.count / maxLocationCount) * 6,
      datum: { kind: 'location', location } satisfies MapDatum,
    });
    const markerSeries = {
      coordinateSystem: 'geo' as const,
      itemStyle: { color: markerColor, opacity: 0.85, borderColor: isDarkMode ? '#000' : '#fff', borderWidth: 0.5 },
      z: 3,
    };

    const countryLine = (country: WorldMapDatum) => {
      const live = country.liveCount ?? Math.max(country.count - (country.simulatedCount ?? 0), 0);
      const active = t('common.active').toLocaleLowerCase(language);
      const lines = [
        `${t('components.worldMap.alerts')}: ${live.toLocaleString()}`,
        `${t('components.dashboardCharts.decisions')}: ${(country.liveDecisionCount ?? 0).toLocaleString()} (${(country.activeLiveDecisionCount ?? 0).toLocaleString()} ${active})`,
      ];
      if (simulationsEnabled && (country.simulatedCount ?? 0) > 0) lines.push(`${t('components.worldMap.simulationAlerts')}: ${(country.simulatedCount ?? 0).toLocaleString()}`);
      if (simulationsEnabled && (country.simulatedDecisionCount ?? 0) > 0) {
        lines.push(`${t('components.dashboardCharts.simulationDecisions')}: ${(country.simulatedDecisionCount ?? 0).toLocaleString()} (${(country.activeSimulatedDecisionCount ?? 0).toLocaleString()} ${active})`);
      }
      return lines;
    };
    const tooltip = (datum: MapDatum) => {
      if (datum.kind === 'country') {
        const code = datum.country.countryCode.toUpperCase();
        const flag = /^[A-Z]{2}$/.test(code) ? `<span class="fi fi-${code.toLowerCase()}" style="width:16px;height:12px;border-radius:2px"></span>` : '';
        const name = getCountryName(code, language) ?? datum.country.label;
        return `<div style="display:flex;flex-direction:column;gap:2px"><strong style="display:flex;align-items:center;gap:6px">${flag}${escapeHtml(name)}</strong>${countryLine(datum.country).map((line) => `<span>${escapeHtml(line)}</span>`).join('')}</div>`;
      }
      const { location } = datum;
      const place = [location.city, location.region, getCountryName(location.countryCode, language)].reduce<string[]>((parts, part) => {
        if (part && !parts.some((existing) => existing.toLocaleLowerCase(language) === part.toLocaleLowerCase(language))) parts.push(part);
        return parts;
      }, []).join(', ');
      return `<div style="display:flex;flex-direction:column;gap:2px"><span style="color:var(--text-color-kumo-subtle);font-size:11px">${escapeHtml(t('components.worldMap.approximateLocation'))}</span><strong>${escapeHtml(place)}</strong><span>${escapeHtml(t('components.worldMap.locationCount', { count: location.count.toLocaleString() }))}</span></div>`;
    };

    return {
      geo: {
        map: MAP_NAME,
        // ISO_A2 is -99 for France and Norway in Natural Earth, the "EH" variant has their codes
        nameProperty: 'ISO_A2_EH',
        projection: PROJECTION,
        boundingCoords: BOUNDING_COORDS,
        // The size is the map's longer side relative to the container's shorter one, so this fills the container, which has the map's aspect ratio
        layoutCenter: ['50%', '50%'],
        layoutSize: `${ASPECT_RATIO * 100}%`,
        // Wheel zoom would trap the page's scrolling, so zooming is left to the buttons
        roam: 'move' as const,
        scaleLimit: { min: 1, max: 8 },
        itemStyle: { areaColor: palette.area, borderColor: isDarkMode ? '#1c1c1f' : '#ffffff', borderWidth: 0.5, opacity: selectedCountry ? 0.45 : 1 },
        label: { show: false },
        emphasis: { label: { show: false }, itemStyle: { ...KEEP_FILL, borderColor: textColor, borderWidth: 1 } },
        select: { disabled: true },
        regions: selectedCountry ? [{ name: selectedCountry, itemStyle: { opacity: 1, borderColor: textColor, borderWidth: 1.5 } }] : [],
      },
      // Kumo's dark ramp ends near white, which glares next to the markers
      visualMap: { type: 'continuous' as const, show: false, min: 0, max: Math.sqrt(maxCount), seriesIndex: 0, inRange: { color: isDarkMode ? palette.scale.slice(0, -1) : palette.scale } },
      tooltip: {
        ...KUMO_TOOLTIP_STYLE,
        trigger: 'item' as const,
        dangerousHtmlFormatter: (params: unknown) => {
          const datum = (params as { data?: { datum?: MapDatum } }).data?.datum;
          return datum ? tooltip(datum) : '';
        },
      },
      series: [
        {
          id: 'countries',
          type: 'map' as const,
          geoIndex: 0,
          // The geo paints countries without a data row in the series color rather than in its own area color
          color: palette.area,
          // Countries without alerts keep the land color rather than the lowest shade
          // Shaded by the square root, so one country with most alerts doesn't leave all others in the lowest shade
          data: data.filter((country) => country.count > 0).map((country) => ({ name: country.countryCode.toUpperCase(), value: Math.sqrt(country.count), datum: { kind: 'country', country } satisfies MapDatum })),
        },
        { ...markerSeries, id: 'markers', type: 'scatter' as const, data: locations.slice(PULSING_MARKERS).map(toMarker) },
        {
          ...markerSeries,
          id: 'pulsing-markers',
          type: 'effectScatter' as const,
          rippleEffect: { brushType: 'stroke' as const, scale: 2.5, period: 3 },
          data: locations.slice(0, PULSING_MARKERS).map(toMarker),
        },
      ],
    };
  }, [attackLocations, data, isDarkMode, language, markersEnabled, selectedCountry, simulationsEnabled, t]);

  const events = useMemo(() => ({
    click: (params: { data?: unknown }) => {
      const datum = (params.data as { datum?: MapDatum } | undefined)?.datum;
      const code = datum?.kind === 'country' ? datum.country.countryCode : datum?.location.countryCode;
      if (code && !selectionDisabledReason) onCountrySelect(code.toUpperCase());
    },
  }), [onCountrySelect, selectionDisabledReason]);

  const zoom = (factor: number) => {
    const chart = chartRef.current;
    chart?.dispatchAction({ type: 'geoRoam', geoIndex: 0, zoom: factor, originX: chart.getWidth() / 2, originY: chart.getHeight() / 2 });
  };

  return (
    <LayerCard>
      <LayerCard.Secondary className="flex-wrap justify-between py-3">
        <span className="flex items-center gap-2 text-kumo-default">
          <GlobeHemisphereWestIcon className="size-4" />
          {t('components.worldMap.title')}
        </span>
        <Switch
          size="sm"
          label={t('components.worldMap.attackMarkers')}
          checked={markersEnabled}
          onCheckedChange={(checked) => {
            setMarkersEnabled(checked);
            window.localStorage.setItem(MARKERS_STORAGE_KEY, String(checked));
          }}
        />
      </LayerCard.Secondary>
      <LayerCard.Primary className="p-0" title={selectionDisabledReason} aria-disabled={selectionDisabledReason ? true : undefined}>
        {mapState === 'ready' ? (
          <>
            <Chart
              key={viewKey}
              ref={chartRef}
              echarts={echarts}
              options={options}
              optionUpdateBehavior={REPLACE_SERIES}
              aspectRatio={ASPECT_RATIO}
              // Without it the canvas of the previous size holds the height when the card narrows, and the aspect ratio cannot shrink it
              className="overflow-hidden"
              isDarkMode={isDarkMode}
              onEvents={events}
            />
            <div className="absolute end-2 top-2 flex flex-col gap-1">
              <Button size="sm" shape="square" icon={MagnifyingGlassPlusIcon} aria-label={t('components.worldMap.zoomIn')} title={t('components.worldMap.zoomIn')} onClick={() => zoom(ZOOM_STEP)} />
              <Button size="sm" shape="square" icon={MagnifyingGlassMinusIcon} aria-label={t('components.worldMap.zoomOut')} title={t('components.worldMap.zoomOut')} onClick={() => zoom(1 / ZOOM_STEP)} />
              <Button size="sm" shape="square" icon={ArrowCounterClockwiseIcon} aria-label={t('components.worldMap.resetView')} title={t('components.worldMap.resetView')} onClick={() => setViewKey((key) => key + 1)} />
            </div>
          </>
        ) : (
          <div className="flex aspect-[1.7] items-center justify-center gap-2 text-sm text-kumo-subtle">
            {mapState === 'loading' ? <><Loader />{t('common.loadingMap')}</> : t('common.noDataAvailable')}
          </div>
        )}
      </LayerCard.Primary>
    </LayerCard>
  );
}
