import { requireSupabase } from './supabase-client.js';

const BUCKET = 'sagrum-clips';

const textColumns = {
  heroText: 'hero_text',
  portfolioText: 'portfolio_text',
  clipsText: 'clips_text',
  infoTitle: 'info_title',
  infoText: 'info_text'
};

const urlColumns = {
  instagramUrl: 'instagram_url',
  tiktokUrl: 'tiktok_url',
  discordUrl: 'discord_url',
  bookingUrl: 'booking_url'
};

function toPublicContent(row, clips) {
  const client = requireSupabase();
  const result = {};
  for (const [property, column] of Object.entries({ ...textColumns, ...urlColumns })) {
    result[property] = row?.[column] || '';
  }
  result.infoTitle = result.infoTitle || 'O mne';
  result.clips = clips.map((clip) => ({
    id: clip.id,
    title: clip.title,
    description: clip.description || '',
    createdAt: clip.created_at,
    src: client.storage.from(BUCKET).getPublicUrl(clip.storage_path).data.publicUrl
  }));
  return result;
}

export async function loadPublicContent() {
  const client = requireSupabase();
  const [contentResult, clipsResult] = await Promise.all([
    client.from('site_content')
      .select('hero_text, portfolio_text, clips_text, info_title, info_text, instagram_url, tiktok_url, discord_url, booking_url')
      .eq('id', 1)
      .single(),
    client.from('site_clips')
      .select('id, title, description, storage_path, created_at')
      .order('created_at', { ascending: false })
  ]);

  if (contentResult.error) throw contentResult.error;
  if (clipsResult.error) throw clipsResult.error;
  return toPublicContent(contentResult.data, clipsResult.data || []);
}

export async function saveContent(changes) {
  const client = requireSupabase();
  const row = {};
  for (const [property, column] of Object.entries({ ...textColumns, ...urlColumns })) {
    if (Object.hasOwn(changes, property)) row[column] = String(changes[property] ?? '').trim();
  }
  if (!Object.keys(row).length) return;
  const { error } = await client.from('site_content').update(row).eq('id', 1);
  if (error) throw error;
}

export async function addClip({ title, description, file, uploadFile }) {
  const client = requireSupabase();
  if (!file) throw new Error('Vyber video súbor.');
  if (file.size > 50 * 1024 * 1024) {
    throw new Error('Video je príliš veľké. Supabase Free povoľuje najviac 50 MB na súbor.');
  }
  if (!['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type)) {
    throw new Error('Podporované sú iba MP4, WebM a MOV videá.');
  }
  const cleanTitle = String(title || '').trim().slice(0, 100);
  if (!cleanTitle) throw new Error('Klip musí mať názov.');

  const extensionByType = {
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov'
  };
  const storagePath = `${crypto.randomUUID()}.${extensionByType[file.type]}`;
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session) throw new Error('Prihlásenie vypršalo. Prihlás sa znova.');

  await uploadFile({ client, file, storagePath, accessToken: sessionData.session.access_token });

  const { data, error } = await client.from('site_clips').insert({
    title: cleanTitle,
    description: String(description || '').trim().slice(0, 500),
    storage_path: storagePath
  }).select('id').single();

  if (error) {
    await client.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    throw error;
  }
  return data;
}

export async function deleteClip(id) {
  const client = requireSupabase();
  const { data: clip, error: findError } = await client.from('site_clips')
    .select('storage_path')
    .eq('id', id)
    .single();
  if (findError) throw findError;

  const { error: deleteError } = await client.from('site_clips').delete().eq('id', id);
  if (deleteError) throw deleteError;

  const { error: storageError } = await client.storage.from(BUCKET).remove([clip.storage_path]);
  if (storageError) {
    throw new Error('Klip bol odstránený zo zoznamu, ale video sa nepodarilo odstrániť z Storage.');
  }
}
