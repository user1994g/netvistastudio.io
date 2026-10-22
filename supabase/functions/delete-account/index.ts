import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { createDeleteAccountHandler } from './handler.js';

Deno.serve(createDeleteAccountHandler({ createClient, env: name => Deno.env.get(name) }));
