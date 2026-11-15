import type { WebviewApi } from './api';

declare global {
  function acquireVsCodeApi(): WebviewApi;
}
