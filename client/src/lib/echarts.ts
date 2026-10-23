import * as echarts from 'echarts/core';
import { BarChart, EffectScatterChart, LineChart, MapChart, ScatterChart } from 'echarts/charts';
import { BrushComponent, GeoComponent, GridComponent, ToolboxComponent, TooltipComponent, VisualMapComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

// Kumo's charts take the ECharts instance as a prop, so only the modules registered here end up in the bundle
// The brush always adds its buttons to a toolbox, which charts hide
echarts.use([BarChart, EffectScatterChart, LineChart, MapChart, ScatterChart, BrushComponent, GeoComponent, GridComponent, ToolboxComponent, TooltipComponent, VisualMapComponent, CanvasRenderer]);

export { echarts };

/** The popup look of Kumo's own chart tooltips, for charts that render ECharts' tooltip */
export const KUMO_TOOLTIP_STYLE = {
  backgroundColor: 'var(--color-kumo-base)',
  borderColor: 'var(--color-kumo-line)',
  borderWidth: 1,
  padding: 8,
  textStyle: { color: 'var(--text-color-kumo-default)', fontSize: 13 },
  extraCssText: 'border-radius: 0.5rem; box-shadow: 0 4px 12px rgb(0 0 0 / 0.12);',
};

/** Updates that merge everything but the series, so a series left out disappears while a zoomed map or a brush keeps its state */
export const REPLACE_SERIES = { replaceMerge: ['series'] };
