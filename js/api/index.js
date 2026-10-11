import { isDemo } from '../env.js';
import { mockAdapter } from './mock.js';
import { remoteAdapter } from './remote.js';

export const api = isDemo ? mockAdapter : remoteAdapter;
export { ApiError } from './errors.js';
