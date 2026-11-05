/// <reference lib="webworker" />
import { runVanitySearch } from './vanitySearch';

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (e) => runVanitySearch(e.data, (m) => self.postMessage(m));
