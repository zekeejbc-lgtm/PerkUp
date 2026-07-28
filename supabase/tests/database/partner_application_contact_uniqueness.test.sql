begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(4);

select has_index(
  'public',
  'applications',
  'applications_normalized_email_key',
  'partner application emails have a normalized unique index'
);

select has_index(
  'public',
  'applications',
  'applications_normalized_phone_key',
  'partner application phones have a normalized unique index'
);

insert into public.applications (id, data)
values (
  'partner-contact-email-original',
  '{"email":"owner@example.com","phoneNumber":"+639111111111"}'::jsonb
);

select throws_ok(
  $$insert into public.applications (id, data)
    values (
      'partner-contact-email-duplicate',
      '{"email":"  Owner@Example.COM  ","phoneNumber":"+639222222222"}'::jsonb
    )$$,
  '23505',
  null,
  'email uniqueness ignores case and surrounding whitespace'
);

insert into public.applications (id, data)
values (
  'partner-contact-phone-original',
  '{"email":"phone-one@example.com","phoneNumber":"0912 345 6789"}'::jsonb
);

select throws_ok(
  $$insert into public.applications (id, data)
    values (
      'partner-contact-phone-duplicate',
      '{"email":"phone-two@example.com","phoneNumber":"+63 912 345 6789"}'::jsonb
    )$$,
  '23505',
  null,
  'phone uniqueness treats local and country-code forms as the same number'
);

select * from finish();
rollback;
