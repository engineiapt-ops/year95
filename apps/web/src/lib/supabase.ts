import { createBrowserSupabaseClient } from './supabaseClient.js';
import { webConfig } from './webConfig.js';

export const browserSupabaseClient = createBrowserSupabaseClient(webConfig);
