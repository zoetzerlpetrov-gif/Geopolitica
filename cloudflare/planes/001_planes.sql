CREATE TABLE IF NOT EXISTS dominus_memberships (
  github_id TEXT PRIMARY KEY NOT NULL CHECK (
    length(github_id) BETWEEN 1 AND 20 AND
    github_id GLOB '[1-9]*' AND
    github_id NOT GLOB '*[^0-9]*'
  ),
  plan TEXT NOT NULL CHECK (plan IN ('recon', 'analyst', 'command')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  expires_at INTEGER CHECK (expires_at IS NULL OR expires_at > 0),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
) STRICT;
