-- Homepage content is stored in the existing JSON-backed settings document.
-- Seed the video section without replacing any existing homepage fields.
insert into public.settings (id, data)
values (
  'homepage',
  jsonb_build_object(
    'howItWorks',
    jsonb_build_object(
      'enabled', true,
      'heading', 'How does it work?',
      'subheading', 'See how Perk makes loyalty simple for customers and local businesses.',
      'videos', '[]'::jsonb
    )
  )
)
on conflict (id) do update
set
  data = case
    when public.settings.data ? 'howItWorks' then public.settings.data
    else public.settings.data || excluded.data
  end,
  updated_at = case
    when public.settings.data ? 'howItWorks' then public.settings.updated_at
    else now()
  end;
