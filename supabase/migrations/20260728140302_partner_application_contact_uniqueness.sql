do $$
begin
  if exists (
    select 1
    from public.applications
    where btrim(coalesce(data->>'email', '')) <> ''
    group by lower(btrim(data->>'email'))
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'Cannot enforce partner application email uniqueness while duplicate normalized emails exist.';
  end if;

  if exists (
    select 1
    from public.applications
    where regexp_replace(coalesce(data->>'phoneNumber', ''), '[^0-9]', '', 'g') <> ''
    group by (
      case
        when regexp_replace(data->>'phoneNumber', '[^0-9]', '', 'g') ~ '^09[0-9]{9}$'
          then '63' || substring(regexp_replace(data->>'phoneNumber', '[^0-9]', '', 'g') from 2)
        when regexp_replace(data->>'phoneNumber', '[^0-9]', '', 'g') ~ '^9[0-9]{9}$'
          then '63' || regexp_replace(data->>'phoneNumber', '[^0-9]', '', 'g')
        else regexp_replace(data->>'phoneNumber', '[^0-9]', '', 'g')
      end
    )
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'Cannot enforce partner application phone uniqueness while duplicate normalized phone numbers exist.';
  end if;
end;
$$;

create unique index applications_normalized_email_key
on public.applications (lower(btrim(data->>'email')))
where btrim(coalesce(data->>'email', '')) <> '';

create unique index applications_normalized_phone_key
on public.applications ((
  case
    when regexp_replace(data->>'phoneNumber', '[^0-9]', '', 'g') ~ '^09[0-9]{9}$'
      then '63' || substring(regexp_replace(data->>'phoneNumber', '[^0-9]', '', 'g') from 2)
    when regexp_replace(data->>'phoneNumber', '[^0-9]', '', 'g') ~ '^9[0-9]{9}$'
      then '63' || regexp_replace(data->>'phoneNumber', '[^0-9]', '', 'g')
    else regexp_replace(data->>'phoneNumber', '[^0-9]', '', 'g')
  end
))
where regexp_replace(coalesce(data->>'phoneNumber', ''), '[^0-9]', '', 'g') <> '';
