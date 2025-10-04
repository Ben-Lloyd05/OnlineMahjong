-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rule cards (store canonical JSON and metadata)
CREATE TABLE IF NOT EXISTS rule_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  year INT NOT NULL,
  card_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(year)
);

-- Games
CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  rule_card_id UUID REFERENCES rule_cards(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | active | complete | cancelled
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Players in a game (seats 0-3)
CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  seat SMALLINT NOT NULL CHECK (seat BETWEEN 0 AND 3),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(game_id, seat)
);

-- Shuffle commitments for provable fairness
CREATE TABLE IF NOT EXISTS shuffle_commits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  client_seed TEXT NOT NULL,
  server_seed_commit TEXT NOT NULL, -- sha256(serverSeed)
  revealed_server_seed TEXT, -- revealed after game ends
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(game_id)
);

-- Moves (replay log)
CREATE TABLE IF NOT EXISTS moves (
  id BIGSERIAL PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_seat SMALLINT CHECK (player_seat BETWEEN 0 AND 3),
  idx INT NOT NULL, -- 0..N order
  move JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(game_id, idx)
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_players_game ON players(game_id);
CREATE INDEX IF NOT EXISTS idx_moves_game ON moves(game_id);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);


