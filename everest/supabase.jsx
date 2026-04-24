// Supabase client + data access helpers.

const sb = window.supabase.createClient(
  window.EVEREST_CONFIG.SUPABASE_URL,
  window.EVEREST_CONFIG.SUPABASE_KEY
);

async function fetchClimbers() {
  const { data, error } = await sb
    .from('climbers')
    .select('id, email, display_name, color, is_admin, created_at')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

async function setMyDisplayName(name) {
  const { error } = await sb.rpc('set_my_display_name', { new_name: name });
  if (error) throw error;
}

async function fetchHikes() {
  const { data, error } = await sb
    .from('hikes')
    .select('id, user_id, name, gain_m, hiked_on, created_at')
    .order('hiked_on', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

async function insertHike({ name, gain_m, hiked_on }) {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data, error } = await sb
    .from('hikes')
    .insert({ user_id: user.id, name, gain_m, hiked_on })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deleteHike(id) {
  const { error } = await sb.from('hikes').delete().eq('id', id);
  if (error) throw error;
}

Object.assign(window, { sb, fetchClimbers, fetchHikes, insertHike, deleteHike, setMyDisplayName });
