-- Sensitive Walker identity documents must never be publicly readable.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'walker-private-documents',
  'walker-private-documents',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.walker_documents (
  id uuid primary key default gen_random_uuid(),
  walker_id uuid not null references public.walkers(id) on delete cascade,
  document_type text not null check (document_type in ('profile_selfie','aadhaar_front','aadhaar_back','pan_card')),
  object_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','application/pdf')),
  file_size_bytes bigint not null check (file_size_bytes between 1 and 5242880),
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.walker_documents enable row level security;
revoke all on public.walker_documents from anon, authenticated;
grant select, insert, delete on public.walker_documents to authenticated;

drop policy if exists "Admins manage Walker document metadata" on public.walker_documents;
create policy "Admins manage Walker document metadata"
on public.walker_documents
for all
to authenticated
using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
)
with check (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
);

drop policy if exists "Admins read Walker private documents" on storage.objects;
create policy "Admins read Walker private documents"
on storage.objects for select to authenticated
using (
  bucket_id = 'walker-private-documents'
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
);

drop policy if exists "Admins upload Walker private documents" on storage.objects;
create policy "Admins upload Walker private documents"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'walker-private-documents'
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
);

drop policy if exists "Admins delete Walker private documents" on storage.objects;
create policy "Admins delete Walker private documents"
on storage.objects for delete to authenticated
using (
  bucket_id = 'walker-private-documents'
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
);

comment on table public.walker_documents is
  'Admin-only metadata for sensitive Walker documents. Actual files live in a private Storage bucket.';
