create table if not exists public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    full_name text not null check (length(trim(full_name)) between 2 and 120),
    role text not null check (role in ('client', 'lawyer')),
    is_verified boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    requested_role text;
    requested_name text;
begin
    requested_role := coalesce(new.raw_user_meta_data ->> 'role', 'client');
    if requested_role not in ('client', 'lawyer') then
        requested_role := 'client';
    end if;

    requested_name := trim(coalesce(new.raw_user_meta_data ->> 'full_name', ''));
    if length(requested_name) < 2 then
        requested_name := 'LEX user';
    end if;

    insert into public.profiles (id, full_name, role)
    values (new.id, requested_name, requested_role);
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();

create table if not exists public.chat_conversations (
    id uuid primary key default gen_random_uuid(),
    conversation_key text not null unique,
    provider text not null default 'stream',
    provider_channel_id text not null unique,
    member_ids uuid[] not null,
    created_at timestamptz not null default now(),
    check (cardinality(member_ids) = 2)
);

create table if not exists public.documents (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references public.profiles (id) on delete cascade,
    category text not null check (category in ('lawyer_verification')),
    storage_path text not null unique,
    original_name text not null,
    content_type text not null check (content_type in ('application/pdf', 'image/jpeg', 'image/png')),
    size_bytes integer not null check (size_bytes between 1 and 8388608),
    scan_status text not null default 'pending' check (scan_status in ('pending', 'clean', 'rejected')),
    created_at timestamptz not null default now()
);

create table if not exists public.lawyer_applications (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null unique references public.profiles (id) on delete cascade,
    mobile text not null,
    bar_registration text not null,
    experience_years smallint not null check (experience_years between 0 and 70),
    practice_area text not null,
    jurisdiction text not null,
    verification_document_id uuid not null references public.documents (id),
    status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    consented_at timestamptz not null default now(),
    submitted_at timestamptz not null default now(),
    reviewed_by uuid references public.profiles (id),
    reviewed_at timestamptz,
    review_note text not null default '' check (length(review_note) <= 1000)
);

create table if not exists public.audit_events (
    id uuid primary key default gen_random_uuid(),
    actor_id uuid references public.profiles (id) on delete set null,
    action text not null,
    subject_id uuid,
    details jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.chat_conversations enable row level security;
alter table public.documents enable row level security;
alter table public.lawyer_applications enable row level security;
alter table public.audit_events enable row level security;

revoke all on public.profiles from anon, authenticated;
grant select (id, full_name, role, is_verified) on public.profiles to authenticated;
create policy "Users can view their own profile"
    on public.profiles for select to authenticated
    using ((select auth.uid()) = id);

revoke all on public.chat_conversations from anon, authenticated;
grant select on public.chat_conversations to authenticated;
create policy "Conversation members can view their conversations"
    on public.chat_conversations for select to authenticated
    using ((select auth.uid()) = any(member_ids));

grant all on public.profiles to service_role;
grant all on public.chat_conversations to service_role;
grant select on public.documents to authenticated;
grant select on public.lawyer_applications to authenticated;
revoke all on public.audit_events from anon, authenticated;
grant all on public.documents to service_role;
grant all on public.lawyer_applications to service_role;
grant all on public.audit_events to service_role;

create policy "Users can view their own document metadata"
    on public.documents for select to authenticated
    using ((select auth.uid()) = owner_id);
create policy "Lawyers can view their own applications"
    on public.lawyer_applications for select to authenticated
    using ((select auth.uid()) = profile_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'lex-private-documents',
    'lex-private-documents',
    false,
    8388608,
    array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.review_lawyer_application(
    application_id uuid,
    reviewer_id uuid,
    decision text,
    reviewer_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    application_row public.lawyer_applications%rowtype;
begin
    if decision not in ('approved', 'rejected') then
        raise exception 'Invalid review decision';
    end if;

    select * into application_row
    from public.lawyer_applications
    where id = application_id
    for update;

    if not found then
        return jsonb_build_object('result', 'not_found');
    end if;
    if application_row.status <> 'pending' then
        return jsonb_build_object('result', 'already_reviewed');
    end if;
    if decision = 'approved' and not exists (
        select 1 from public.documents
        where id = application_row.verification_document_id
          and scan_status = 'clean'
    ) then
        return jsonb_build_object('result', 'document_not_clean');
    end if;

    update public.lawyer_applications
    set status = decision,
        reviewed_by = reviewer_id,
        reviewed_at = now(),
        review_note = left(coalesce(reviewer_note, ''), 1000)
    where id = application_id;

    update public.profiles
    set is_verified = (decision = 'approved'),
        updated_at = now()
    where id = application_row.profile_id;

    insert into public.audit_events (actor_id, action, subject_id, details)
    values (
        reviewer_id,
        'lawyer_application_reviewed',
        application_id,
        jsonb_build_object('decision', decision)
    );

    return jsonb_build_object('result', decision);
end;
$$;

revoke all on function public.review_lawyer_application(uuid, uuid, text, text) from public;
grant execute on function public.review_lawyer_application(uuid, uuid, text, text) to service_role;
