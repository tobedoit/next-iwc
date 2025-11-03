-- Add covering index for users.org_id to improve FK performance
create index if not exists idx_users_org
  on users (org_id);
