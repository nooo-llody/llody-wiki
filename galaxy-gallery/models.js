// models.js
import { makeBuilding } from './utils.js';

export function createModelFactory(config) {
  return async function createModel({ color, seed, url }) {
    if (config.loadModel && url) {
      return await config.loadModel(url);
    }
    return makeBuilding(color, seed);
  };
}